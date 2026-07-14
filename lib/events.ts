import { SupabaseClient } from "@supabase/supabase-js";

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
