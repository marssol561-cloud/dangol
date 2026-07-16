// Server-only.
import { getServerClient } from "./dangolDb";

export type SegmentType = "grade" | "churn" | "anniversary" | "tag";

export interface SegmentCustomer {
  id: string;
  phone_enc: string | null;
  email_enc: string | null;
  kakao_enc: string | null;
  grade: string;
  last_visit_at: string | null;
  name: string | null;
  unsub_token: string | null;
}

export interface ResolveSegmentOptions {
  storeLinkId: string;
  type: SegmentType;
  // For grade segment: 'vip'|'regular'|'normal'. Default: all.
  grade?: string;
  // For churn: days since last visit (default 60)
  churnDays?: number;
  // For anniversary: ISO date string to match birth_month/day (not implemented in MVP, returns empty)
  // For tag: exact customer_tags.tag value to match (SP-E5)
  tag?: string;
}

export async function resolveSegment(
  opts: ResolveSegmentOptions
): Promise<SegmentCustomer[]> {
  const db = getServerClient();
  const { storeLinkId, type, grade, churnDays = 60, tag } = opts;

  if (type === "grade") {
    const query = db
      .from("customers")
      .select("id, phone_enc, email_enc, kakao_enc, grade, last_visit_at, name, unsub_token")
      .eq("store_link_id", storeLinkId);

    const baseQuery = query.is("deleted_at", null);
    const { data, error } = grade
      ? await baseQuery.eq("grade", grade)
      : await baseQuery;

    if (error) throw error;
    return (data ?? []) as SegmentCustomer[];
  }

  if (type === "churn") {
    const cutoff = new Date(Date.now() - churnDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("customers")
      .select("id, phone_enc, email_enc, kakao_enc, grade, last_visit_at, name, unsub_token")
      .eq("store_link_id", storeLinkId)
      .lt("last_visit_at", cutoff)
      .is("deleted_at", null);

    if (error) throw error;
    return (data ?? []) as SegmentCustomer[];
  }

  if (type === "tag") {
    if (!tag) return [];

    const { data: tagRows, error: tagErr } = await db
      .from("customer_tags")
      .select("customer_id")
      .eq("store_link_id", storeLinkId)
      .eq("tag", tag);

    if (tagErr) throw tagErr;
    const customerIds = [...new Set((tagRows ?? []).map((r: { customer_id: string }) => r.customer_id))];
    if (customerIds.length === 0) return [];

    const { data, error } = await db
      .from("customers")
      .select("id, phone_enc, email_enc, kakao_enc, grade, last_visit_at, name, unsub_token")
      .in("id", customerIds)
      .eq("store_link_id", storeLinkId)
      .is("deleted_at", null);

    if (error) throw error;
    return (data ?? []) as SegmentCustomer[];
  }

  // anniversary: requires birth date column — not yet collected, return empty
  return [];
}
