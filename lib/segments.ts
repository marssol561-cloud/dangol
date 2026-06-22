// Server-only.
import { getServerClient } from "./dangolDb";

export type SegmentType = "grade" | "churn" | "anniversary";

export interface SegmentCustomer {
  id: string;
  phone_enc: string | null;
  email_enc: string | null;
  kakao_enc: string | null;
  grade: string;
  last_visit_at: string | null;
  name: string | null;
}

export interface ResolveSegmentOptions {
  storeLinkId: string;
  type: SegmentType;
  // For grade segment: 'vip'|'regular'|'normal'. Default: all.
  grade?: string;
  // For churn: days since last visit (default 60)
  churnDays?: number;
  // For anniversary: ISO date string to match birth_month/day (not implemented in MVP, returns empty)
}

export async function resolveSegment(
  opts: ResolveSegmentOptions
): Promise<SegmentCustomer[]> {
  const db = getServerClient();
  const { storeLinkId, type, grade, churnDays = 60 } = opts;

  if (type === "grade") {
    const query = db
      .from("customers")
      .select("id, phone_enc, email_enc, kakao_enc, grade, last_visit_at, name")
      .eq("store_link_id", storeLinkId);

    const { data, error } = grade
      ? await query.eq("grade", grade)
      : await query;

    if (error) throw error;
    return (data ?? []) as SegmentCustomer[];
  }

  if (type === "churn") {
    const cutoff = new Date(Date.now() - churnDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("customers")
      .select("id, phone_enc, email_enc, kakao_enc, grade, last_visit_at, name")
      .eq("store_link_id", storeLinkId)
      .lt("last_visit_at", cutoff);

    if (error) throw error;
    return (data ?? []) as SegmentCustomer[];
  }

  // anniversary: requires birth date column — not yet collected, return empty
  return [];
}
