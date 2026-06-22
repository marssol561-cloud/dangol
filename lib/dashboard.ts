// Server-only: all aggregations scoped to a single store_link_id.
import { getServerClient } from "@/lib/dangolDb";
import { computeGradeDisplay } from "@/lib/grade";

export interface MonthlyStats {
  newCustomers: number;
  returningVisits: number;
  returnRate: number;
  cumulativeRegulars: number;
}

export interface ConsentRateResult {
  total: number;
  consented: number;
  rate: number;
}

export interface MessageEffectResult {
  revisitCount: number;
}

export interface TodayCard {
  segment: "churn" | "stamp_near" | "anniversary";
  count: number;
  label: string;
}

export async function monthlyStats(storeLinkId: string): Promise<MonthlyStats> {
  const db = getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: newRows } = await db
    .from("customers")
    .select("id")
    .eq("store_link_id", storeLinkId)
    .gte("created_at", monthStart);

  const newCustomerIds = new Set((newRows ?? []).map((c: { id: string }) => c.id));
  const newCustomers = newCustomerIds.size;

  const { data: monthVisits } = await db
    .from("visits")
    .select("customer_id")
    .eq("store_link_id", storeLinkId)
    .gte("visited_at", monthStart);

  const totalVisits = monthVisits?.length ?? 0;
  const returningVisits = (monthVisits ?? []).filter(
    (v: { customer_id: string }) => !newCustomerIds.has(v.customer_id)
  ).length;

  const returnRate = totalVisits > 0 ? returningVisits / totalVisits : 0;

  const { count: cumulativeRegulars } = await db
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("store_link_id", storeLinkId)
    .gte("visit_count", 20);

  return { newCustomers, returningVisits, returnRate, cumulativeRegulars: cumulativeRegulars ?? 0 };
}

export async function consentRate(storeLinkId: string): Promise<ConsentRateResult> {
  const db = getServerClient();

  const { count: total } = await db
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("store_link_id", storeLinkId);

  const { data: consentRows } = await db
    .from("consents")
    .select("customer_id")
    .eq("store_link_id", storeLinkId)
    .eq("agreed", true)
    .in("type", ["thirdparty", "ad_sms", "ad_kakao", "ad_email"]);

  const consentedIds = new Set((consentRows ?? []).map((c: { customer_id: string }) => c.customer_id));
  const consented = consentedIds.size;
  const t = total ?? 0;
  return { total: t, consented, rate: t > 0 ? consented / t : 0 };
}

export async function messageEffect(storeLinkId: string): Promise<MessageEffectResult> {
  const db = getServerClient();

  const { data: sentMsgs } = await db
    .from("messages")
    .select("customer_id, sent_at")
    .eq("store_link_id", storeLinkId)
    .eq("status", "sent")
    .not("customer_id", "is", null);

  if (!sentMsgs || sentMsgs.length === 0) return { revisitCount: 0 };

  // Earliest sent_at per customer
  const firstSent = new Map<string, string>();
  for (const m of sentMsgs) {
    const cid = m.customer_id as string;
    const sat = m.sent_at as string;
    if (!firstSent.has(cid) || sat < firstSent.get(cid)!) firstSent.set(cid, sat);
  }

  let revisitCount = 0;
  for (const [customerId, sentAt] of firstSent.entries()) {
    const { count } = await db
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("store_link_id", storeLinkId)
      .eq("customer_id", customerId)
      .gt("visited_at", sentAt);
    if ((count ?? 0) > 0) revisitCount++;
  }

  return { revisitCount };
}

export async function todayCards(storeLinkId: string): Promise<TodayCard[]> {
  const db = getServerClient();
  const now = new Date();
  const churnCutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { count: churnCount } = await db
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("store_link_id", storeLinkId)
    .not("last_visit_at", "is", null)
    .lt("last_visit_at", churnCutoff);

  const { data: stampsPolicy } = await db
    .from("stamps_rewards")
    .select("required_count")
    .eq("store_link_id", storeLinkId)
    .maybeSingle();

  const required = (stampsPolicy as { required_count: number } | null)?.required_count ?? 10;

  const { data: customers } = await db
    .from("customers")
    .select("id, visit_count, created_at")
    .eq("store_link_id", storeLinkId);

  const list = (customers ?? []) as { id: string; visit_count: number; created_at: string }[];

  let stampNearCount = 0;
  let anniversaryCount = 0;

  for (const c of list) {
    const mod = c.visit_count % required;
    if (mod === required - 1 || mod === required - 2) stampNearCount++;

    const created = new Date(c.created_at);
    const anniv = new Date(now.getFullYear(), created.getMonth(), created.getDate());
    if (Math.abs(now.getTime() - anniv.getTime()) <= 7 * 24 * 60 * 60 * 1000) anniversaryCount++;
  }

  return [
    { segment: "churn", count: churnCount ?? 0, label: "단골이 끊겼어요" },
    { segment: "stamp_near", count: stampNearCount, label: "스탬프 1~2개 남았어요" },
    { segment: "anniversary", count: anniversaryCount, label: "가입 기념일이에요" },
  ];
}

export interface CustomerListItem {
  id: string;
  name: string | null;
  displayContact: string | null;
  channel: string | null;
  grade: string;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
}

export async function getCustomersList(
  storeLinkId: string,
  filters: { grade?: string; channel?: string; lastVisitDays?: number }
): Promise<CustomerListItem[]> {
  const db = getServerClient();
  const { maskPhone, maskEmail, maskKakao } = await import("@/lib/maskPii");
  const { decryptPII } = await import("@/lib/crypto");

  // Monthly visits for grade display
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: monthVisits } = await db
    .from("visits")
    .select("customer_id")
    .eq("store_link_id", storeLinkId)
    .gte("visited_at", monthStart);

  const monthlyMap = new Map<string, number>();
  for (const v of monthVisits ?? []) {
    const cid = v.customer_id as string;
    monthlyMap.set(cid, (monthlyMap.get(cid) ?? 0) + 1);
  }

  let query = db
    .from("customers")
    .select("id, name, grade, visit_count, last_visit_at, phone_enc, email_enc, kakao_enc, created_at")
    .eq("store_link_id", storeLinkId)
    .order("last_visit_at", { ascending: false, nullsFirst: false });

  if (filters.grade) query = query.eq("grade", filters.grade);
  if (filters.channel === "phone") query = query.not("phone_enc", "is", null);
  if (filters.channel === "email") query = query.not("email_enc", "is", null);
  if (filters.channel === "kakao") query = query.not("kakao_enc", "is", null);
  if (filters.lastVisitDays) {
    const cutoff = new Date(Date.now() - filters.lastVisitDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.lt("last_visit_at", cutoff);
  }

  const { data: rows } = await query;

  return (rows ?? []).map((c: Record<string, unknown>) => {
    let displayContact: string | null = null;
    let channel: string | null = null;
    try {
      if (c.phone_enc) { displayContact = maskPhone(decryptPII(c.phone_enc as string)); channel = "phone"; }
      else if (c.email_enc) { displayContact = maskEmail(decryptPII(c.email_enc as string)); channel = "email"; }
      else if (c.kakao_enc) { displayContact = maskKakao(decryptPII(c.kakao_enc as string)); channel = "kakao"; }
    } catch { displayContact = "***"; }

    const displayGrade = computeGradeDisplay(c.visit_count as number, monthlyMap.get(c.id as string) ?? 0);

    return {
      id: c.id as string,
      name: (c.name as string | null) ?? null,
      displayContact,
      channel,
      grade: displayGrade,
      visit_count: c.visit_count as number,
      last_visit_at: (c.last_visit_at as string | null) ?? null,
      created_at: c.created_at as string,
    };
  });
}
