import { SupabaseClient } from "@supabase/supabase-js";
import { resolveSegment, type SegmentType } from "./segments";
import { filterNonDeleted, isNightBlocked } from "./sendGuard";
import { sendToSegment } from "./messaging";
import type { TemplateId } from "./templates";

export type EventRow = {
  id: string;
  store_link_id: string;
  type: "onsite" | "preannounce";
  title: string;
  description: string | null;
  condition: string | null;
  reward_coupon_kind: string | null;
  reward_benefit: string | null;
  start_at: string | null;
  end_at: string | null;
  issue_cap: number | null;
  coupon_valid_days: number | null;
  target_segment: unknown;
  status: "scheduled" | "active" | "closed" | "ended";
  created_by: string | null;
  created_at: string;
};

export type EventResolution =
  | { state: "active"; event: EventRow }
  | { state: "closed"; event: EventRow }
  | { state: "none"; event: null };

// onsite 우선, 동률이면 최신 생성순
function byPriority(a: EventRow, b: EventRow): number {
  if (a.type !== b.type) return a.type === "onsite" ? -1 : 1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/**
 * 순수 조회 함수 — 쓰기 없음. SP-E3 이후에서도 재사용.
 */
export async function resolveStoreEvent(
  db: SupabaseClient,
  storeLinkId: string
): Promise<EventResolution> {
  const { data: events, error } = await db
    .from("events")
    .select("*")
    .eq("store_link_id", storeLinkId);

  if (error || !events || events.length === 0) {
    return { state: "none", event: null };
  }

  const rows = events as EventRow[];
  const now = new Date();

  const approvedCounts = await Promise.all(
    rows.map(async (e) => {
      const { count } = await db
        .from("event_participations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", e.id)
        .eq("status", "approved");
      return count ?? 0;
    })
  );

  const isAvailable = (e: EventRow, approvedCount: number): boolean => {
    if (e.status !== "scheduled" && e.status !== "active") return false;
    if (e.start_at && new Date(e.start_at) > now) return false;
    if (e.end_at && now > new Date(e.end_at)) return false;
    if (e.issue_cap !== null && approvedCount >= e.issue_cap) return false;
    return true;
  };

  const available = rows.filter((e, i) => isAvailable(e, approvedCounts[i]));
  if (available.length > 0) {
    return { state: "active", event: [...available].sort(byPriority)[0] };
  }

  const isClosedCandidate = (e: EventRow, approvedCount: number): boolean => {
    if (e.issue_cap !== null && approvedCount >= e.issue_cap) return true;
    if (e.start_at && e.end_at) {
      const start = new Date(e.start_at);
      const end = new Date(e.end_at);
      if (start <= now && now <= end) return true;
    }
    if (e.end_at && now > new Date(e.end_at)) return true;
    return false;
  };

  const closedCandidates = rows.filter((e, i) => isClosedCandidate(e, approvedCounts[i]));
  if (closedCandidates.length > 0) {
    return { state: "closed", event: [...closedCandidates].sort(byPriority)[0] };
  }

  return { state: "none", event: null };
}

// ============================================================
// SP-E2: A10 event management — status derivation, list/detail,
// create/update validation, preannounce audience estimate + send.
// ============================================================

export interface ParticipationRow {
  id: string;
  event_id: string;
  customer_id: string;
  store_link_id: string;
  status: "pending" | "approved" | "expired" | "cancelled";
  condition_answer: string | null;
  approved_by: string | null;
  approved_at: string | null;
  tag: string | null;
  coupon_id: string | null;
  created_at: string;
}

export type EventListItem = EventRow & { derivedStatus: EventRow["status"]; approvedCount: number };

export interface EventCounters {
  participated: number;
  issued: number;
  exchanged: number;
  thirdPartyConsentRate: number;
}

export interface EventDetail {
  event: EventListItem;
  participants: ParticipationRow[];
  counters: EventCounters;
}

/**
 * Stored events.status is a hint set at creation, not re-derived on time/cap change.
 * 'ended' is a manual override (future sprint) — preserved as-is if already stored;
 * otherwise derived purely from start_at/end_at/issue_cap so list/detail reflect
 * time/cap exhaustion without a cron job.
 */
export function deriveStatus(
  event: Pick<EventRow, "status" | "start_at" | "end_at" | "issue_cap">,
  approvedCount: number,
  now: Date = new Date()
): EventRow["status"] {
  if (event.status === "ended") return "ended";
  if (event.start_at && new Date(event.start_at) > now) return "scheduled";
  if (event.issue_cap != null && approvedCount >= event.issue_cap) return "closed";
  if (event.end_at && now > new Date(event.end_at)) return "closed";
  return "active";
}

async function countApproved(db: SupabaseClient, eventId: string): Promise<number> {
  const { count } = await db
    .from("event_participations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "approved");
  return count ?? 0;
}

export async function listStoreEvents(
  db: SupabaseClient,
  storeLinkId: string
): Promise<EventListItem[]> {
  const { data, error } = await db
    .from("events")
    .select("*")
    .eq("store_link_id", storeLinkId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as EventRow[];
  const now = new Date();

  return Promise.all(
    rows.map(async (event) => {
      const approvedCount = await countApproved(db, event.id);
      return { ...event, approvedCount, derivedStatus: deriveStatus(event, approvedCount, now) };
    })
  );
}

export async function getEventDetail(
  db: SupabaseClient,
  eventId: string,
  storeLinkId: string
): Promise<EventDetail | null> {
  const { data, error } = await db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error || !data) return null;

  const event = data as EventRow;
  if (event.store_link_id !== storeLinkId) return null;

  const { data: participationRows } = await db
    .from("event_participations")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const participants = (participationRows ?? []) as ParticipationRow[];
  const participated = participants.length;
  const issued = participants.filter((p) => p.status === "approved").length;

  const { count: exchangedCount } = await db
    .from("coupons")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "used");
  const exchanged = exchangedCount ?? 0;

  let thirdPartyConsentRate = 0;
  if (participated > 0) {
    const customerIds = participants.map((p) => p.customer_id);
    const { data: consentRows } = await db
      .from("consents")
      .select("customer_id")
      .in("customer_id", customerIds)
      .eq("type", "thirdparty")
      .eq("agreed", true)
      .is("revoked_at", null);
    const agreed = new Set((consentRows ?? []).map((r: { customer_id: string }) => r.customer_id));
    const agreedCount = participants.filter((p) => agreed.has(p.customer_id)).length;
    thirdPartyConsentRate = agreedCount / Math.max(participated, 1);
  }

  return {
    event: { ...event, approvedCount: issued, derivedStatus: deriveStatus(event, issued) },
    participants,
    counters: { participated, issued, exchanged, thirdPartyConsentRate },
  };
}

export interface EventInput {
  type?: "onsite" | "preannounce";
  title?: string;
  description?: string | null;
  condition?: string | null;
  reward_coupon_kind?: string | null;
  reward_benefit?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  issue_cap?: number | null;
  coupon_valid_days?: number | null;
  target_segment?: unknown;
}

export type EventValidationError = "title_required" | "period_inverted" | "cap_zero" | "reward_missing";

/**
 * `existing` supplies fields absent from `input` for a PATCH partial update.
 * For POST create, `existing` is omitted — every field comes from `input`.
 */
export function validateEventInput(
  input: EventInput,
  existing?: Pick<EventRow, "title" | "start_at" | "end_at" | "issue_cap" | "reward_coupon_kind" | "reward_benefit">
): EventValidationError | null {
  const title = input.title !== undefined ? input.title : existing?.title;
  if (!title || !title.trim()) return "title_required";

  const startAt = input.start_at !== undefined ? input.start_at : existing?.start_at ?? null;
  const endAt = input.end_at !== undefined ? input.end_at : existing?.end_at ?? null;
  if (startAt && endAt && new Date(endAt) < new Date(startAt)) return "period_inverted";

  const issueCap = input.issue_cap !== undefined ? input.issue_cap : existing?.issue_cap ?? null;
  if (issueCap != null && issueCap <= 0) return "cap_zero";

  const rewardKind = input.reward_coupon_kind !== undefined ? input.reward_coupon_kind : existing?.reward_coupon_kind ?? null;
  const rewardBenefit = input.reward_benefit !== undefined ? input.reward_benefit : existing?.reward_benefit ?? null;
  if (!rewardKind && !rewardBenefit) return "reward_missing";

  return null;
}

export async function createEvent(
  db: SupabaseClient,
  storeLinkId: string,
  createdBy: string,
  input: EventInput
): Promise<{ event: EventRow } | { error: EventValidationError }> {
  const err = validateEventInput(input);
  if (err) return { error: err };

  const status = deriveStatus(
    { status: "scheduled", start_at: input.start_at ?? null, end_at: input.end_at ?? null, issue_cap: input.issue_cap ?? null },
    0
  );

  const { data, error } = await db
    .from("events")
    .insert({
      store_link_id: storeLinkId,
      type: input.type ?? "onsite",
      title: input.title,
      description: input.description ?? null,
      condition: input.condition ?? null,
      reward_coupon_kind: input.reward_coupon_kind ?? null,
      reward_benefit: input.reward_benefit ?? null,
      start_at: input.start_at ?? null,
      end_at: input.end_at ?? null,
      issue_cap: input.issue_cap ?? null,
      coupon_valid_days: input.coupon_valid_days ?? 14,
      target_segment: input.target_segment ?? null,
      status,
      created_by: createdBy,
    })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("createEvent insert failed");
  return { event: data as EventRow };
}

const PATCHABLE_FIELDS: (keyof EventInput)[] = [
  "type", "title", "description", "condition", "reward_coupon_kind",
  "reward_benefit", "start_at", "end_at", "issue_cap", "coupon_valid_days", "target_segment",
];

export async function updateEvent(
  db: SupabaseClient,
  eventId: string,
  storeLinkId: string,
  input: EventInput
): Promise<{ event: EventRow } | { error: EventValidationError } | { notFound: true }> {
  const { data: existingData, error: fetchErr } = await db
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (fetchErr || !existingData) return { notFound: true };
  const existing = existingData as EventRow;
  if (existing.store_link_id !== storeLinkId) return { notFound: true };

  const err = validateEventInput(input, existing);
  if (err) return { error: err };

  // store_link_id is never patchable — EventInput has no such field, so this can't leak in.
  const patch: Record<string, unknown> = {};
  for (const f of PATCHABLE_FIELDS) {
    if (input[f] !== undefined) patch[f] = input[f];
  }

  const { data, error } = await db
    .from("events")
    .update(patch)
    .eq("id", eventId)
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("updateEvent update failed");
  return { event: data as EventRow };
}

// [CONFIG — confirm with CEO before real send] placeholder per-message price in KRW.
// No confirmed unit price source at implementation time (SP-E2); used only to compute
// the preview cost estimate shown to the owner before sending. costIsEstimate flags this.
export const PREANNOUNCE_UNIT_PRICE_KRW = 20;

/**
 * Count-only audience size for a segment — reuses the same resolution the send
 * engine (sendToSegment) applies, so the preview count matches the real send.
 */
export async function estimateAudience(
  db: SupabaseClient,
  storeLinkId: string,
  segment: SegmentType
): Promise<{ count: number }> {
  const raw = await resolveSegment({ storeLinkId, type: segment });
  const alive = await filterNonDeleted(raw);
  return { count: alive.length };
}

export type AnnounceError = "not_found" | "not_preannounce" | "night_blocked";

export async function previewAnnounce(
  db: SupabaseClient,
  eventId: string,
  storeLinkId: string,
  segment: SegmentType
): Promise<{ count: number; estimatedCost: number; costIsEstimate: true } | { error: AnnounceError }> {
  const detail = await getEventDetail(db, eventId, storeLinkId);
  if (!detail) return { error: "not_found" };
  if (detail.event.type !== "preannounce") return { error: "not_preannounce" };

  const { count } = await estimateAudience(db, storeLinkId, segment);
  return { count, estimatedCost: count * PREANNOUNCE_UNIT_PRICE_KRW, costIsEstimate: true };
}

/** Reuses sendToSegment + isNightBlocked as-is — no reimplementation of the send engine. */
export async function sendAnnounce(
  db: SupabaseClient,
  eventId: string,
  storeLinkId: string,
  segment: SegmentType,
  templateId: TemplateId,
  templateVars: Record<string, string> = {}
): Promise<{ sent: number; failed: number; skipped: number } | { error: AnnounceError }> {
  const detail = await getEventDetail(db, eventId, storeLinkId);
  if (!detail) return { error: "not_found" };
  if (detail.event.type !== "preannounce") return { error: "not_preannounce" };
  if (isNightBlocked()) return { error: "night_blocked" };

  return sendToSegment(storeLinkId, segment, templateId, templateVars);
}
