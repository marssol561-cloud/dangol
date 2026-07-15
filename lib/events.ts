import { SupabaseClient } from "@supabase/supabase-js";
import { resolveSegment, type SegmentType } from "./segments";
import { filterNonDeleted, isNightBlocked } from "./sendGuard";
import { sendToSegment } from "./messaging";
import type { TemplateId } from "./templates";
import { hashPII, encryptPII } from "./crypto";

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

// ============================================================
// SP-E3: customer event participation (B1/B2/B3) — pending-only join,
// no coupon issuance here (issuance = staff approval, SP-E4).
// ============================================================

type Channel = "phone" | "kakao" | "email";

function generateEventToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CreateParticipationInput {
  storeCode: string;
  channel: Channel;
  identifier: string;
  name?: string;
  visitPurpose?: string;
  companion?: string;
  consents: { required: boolean; thirdparty: boolean; ad_sms: boolean; ad_kakao: boolean; ad_email: boolean };
  browserToken?: string;
}

export type ParticipationError = "no_active_event" | "consent_required" | "thirdparty_required" | "store_not_found";

/**
 * Creates a PENDING event_participations row only — never issues a coupon
 * (coupon issuance happens on staff approval, SP-E4). Idempotent per
 * UNIQUE(event_id, customer_id): a repeat call returns the existing row's
 * status instead of erroring or duplicating.
 */
export async function createParticipation(
  db: SupabaseClient,
  input: CreateParticipationInput
): Promise<{ status: ParticipationRow["status"]; browserToken: string } | { error: ParticipationError }> {
  const { data: storeLink } = await db.from("store_links").select("id").eq("store_code", input.storeCode).maybeSingle();
  if (!storeLink) return { error: "store_not_found" };
  const storeLinkId = (storeLink as { id: string }).id;

  const resolution = await resolveStoreEvent(db, storeLinkId);
  if (resolution.state !== "active") return { error: "no_active_event" };
  const event = resolution.event;

  const hash = hashPII(input.identifier, input.channel);
  const hashCol = `${input.channel}_hash`;

  const { data: existingCustomer } = await db
    .from("customers")
    .select("id, browser_token")
    .eq("store_link_id", storeLinkId)
    .eq(hashCol, hash)
    .maybeSingle();

  let customerId: string;
  let browserToken: string;

  if (existingCustomer) {
    const ec = existingCustomer as { id: string; browser_token: string | null };
    customerId = ec.id;
    browserToken = ec.browser_token ?? input.browserToken ?? generateEventToken();
  } else {
    const enc = encryptPII(input.identifier);
    browserToken = input.browserToken ?? generateEventToken();

    const insertRow: Record<string, unknown> = {
      store_link_id: storeLinkId,
      visit_purpose: input.visitPurpose ?? null,
      companion: input.companion ?? null,
      name: input.name ?? null,
      browser_token: browserToken,
      unsub_token: generateEventToken(),
      grade: "normal",
      visit_count: 0,
    };
    insertRow[hashCol] = hash;
    insertRow[`${input.channel}_enc`] = enc;

    const { data: newCustomer, error: insertErr } = await db.from("customers").insert(insertRow).select("id").single();
    if (insertErr || !newCustomer) throw insertErr ?? new Error("createParticipation customer insert failed");
    customerId = (newCustomer as { id: string }).id;
  }

  // Both mandatory consents — from existing agreed rows OR this submission.
  const { data: existingConsentRows } = await db
    .from("consents")
    .select("type")
    .eq("customer_id", customerId)
    .in("type", ["required", "thirdparty"])
    .eq("agreed", true)
    .is("revoked_at", null);

  const has = new Set((existingConsentRows ?? []).map((r: { type: string }) => r.type));
  const hasRequired = has.has("required") || input.consents.required;
  const hasThirdparty = has.has("thirdparty") || input.consents.thirdparty;

  if (!hasRequired) return { error: "consent_required" };
  if (!hasThirdparty) return { error: "thirdparty_required" };

  const now = new Date().toISOString();
  const toInsert: Array<{ customer_id: string; store_link_id: string; type: string; agreed: boolean; agreed_at: string }> = [];
  const allConsents: [string, boolean][] = [
    ["required", input.consents.required],
    ["thirdparty", input.consents.thirdparty],
    ["ad_sms", input.consents.ad_sms],
    ["ad_kakao", input.consents.ad_kakao],
    ["ad_email", input.consents.ad_email],
  ];
  for (const [type, agreed] of allConsents) {
    if (agreed && !has.has(type)) {
      toInsert.push({ customer_id: customerId, store_link_id: storeLinkId, type, agreed: true, agreed_at: now });
    }
  }
  if (toInsert.length > 0) await db.from("consents").insert(toInsert);

  // Idempotent per UNIQUE(event_id, customer_id) — check first, then handle a concurrent-insert race.
  const { data: existingParticipation } = await db
    .from("event_participations")
    .select("status")
    .eq("event_id", event.id)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (existingParticipation) {
    return { status: (existingParticipation as { status: ParticipationRow["status"] }).status, browserToken };
  }

  const { data: participation, error: partErr } = await db
    .from("event_participations")
    .insert({
      event_id: event.id,
      customer_id: customerId,
      store_link_id: storeLinkId,
      status: "pending",
      condition_answer: input.visitPurpose ?? null,
    })
    .select("status")
    .single();

  if (partErr || !participation) {
    // Unique-violation race: another request created the row first — return its status instead of erroring.
    const { data: retry } = await db
      .from("event_participations")
      .select("status")
      .eq("event_id", event.id)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (retry) return { status: (retry as { status: ParticipationRow["status"] }).status, browserToken };
    throw partErr ?? new Error("createParticipation insert failed");
  }

  return { status: (participation as { status: ParticipationRow["status"] }).status, browserToken };
}

export interface ParticipationStatusResult {
  participation: { status: ParticipationRow["status"]; coupon?: { code: string; benefit: string | null } } | null;
  existingConsents: { required: boolean; thirdparty: boolean };
}

/**
 * Looks up the customer's MOST RECENT event participation at this store
 * (not re-gated on "is an event still active") — a participation that
 * pushed an event over its issue_cap flips resolveStoreEvent to 'closed',
 * which would otherwise make status polling go blind at the exact moment
 * a customer is waiting to see their own approval.
 */
export async function getParticipationStatus(
  db: SupabaseClient,
  storeCode: string,
  lookup: { browserToken: string } | { channel: Channel; identifier: string }
): Promise<ParticipationStatusResult | { error: "store_not_found" }> {
  const { data: storeLink } = await db.from("store_links").select("id").eq("store_code", storeCode).maybeSingle();
  if (!storeLink) return { error: "store_not_found" };
  const storeLinkId = (storeLink as { id: string }).id;

  let customerQuery = db.from("customers").select("id").eq("store_link_id", storeLinkId);
  customerQuery =
    "browserToken" in lookup
      ? customerQuery.eq("browser_token", lookup.browserToken)
      : customerQuery.eq(`${lookup.channel}_hash`, hashPII(lookup.identifier, lookup.channel));

  const { data: customer } = await customerQuery.maybeSingle();
  if (!customer) {
    return { participation: null, existingConsents: { required: false, thirdparty: false } };
  }
  const customerId = (customer as { id: string }).id;

  const { data: consentRows } = await db
    .from("consents")
    .select("type")
    .eq("customer_id", customerId)
    .in("type", ["required", "thirdparty"])
    .eq("agreed", true)
    .is("revoked_at", null);
  const has = new Set((consentRows ?? []).map((r: { type: string }) => r.type));
  const existingConsents = { required: has.has("required"), thirdparty: has.has("thirdparty") };

  const { data: participationRow } = await db
    .from("event_participations")
    .select("status, coupon_id")
    .eq("store_link_id", storeLinkId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!participationRow) return { participation: null, existingConsents };

  const p = participationRow as { status: ParticipationRow["status"]; coupon_id: string | null };
  let coupon: { code: string; benefit: string | null } | undefined;
  if (p.coupon_id) {
    const { data: couponRow } = await db.from("coupons").select("code, benefit").eq("id", p.coupon_id).maybeSingle();
    if (couponRow) coupon = couponRow as { code: string; benefit: string | null };
  }

  return { participation: { status: p.status, ...(coupon ? { coupon } : {}) }, existingConsents };
}

/** Preannounce events not yet started — for the B3 "다가오는 이벤트" banner. */
export async function listUpcomingPreannounce(
  db: SupabaseClient,
  storeLinkId: string
): Promise<{ id: string; title: string; start_at: string | null }[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("events")
    .select("id, title, start_at")
    .eq("store_link_id", storeLinkId)
    .eq("type", "preannounce")
    .eq("status", "scheduled")
    .or(`start_at.is.null,start_at.gt.${nowIso}`)
    .order("start_at", { ascending: true });

  if (error || !data) return [];
  return data as { id: string; title: string; start_at: string | null }[];
}
