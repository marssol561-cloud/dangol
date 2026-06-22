// Server-only — consent filter, night block, daily cap + dedupe.
import { getServerClient } from "./dangolDb";

export type ConsentChannel = "sms" | "kakao" | "email";

export interface CustomerContact {
  id: string;
  phone_enc: string | null;
  email_enc: string | null;
  kakao_enc: string | null;
}

// Night block: 21:00–08:00 KST (UTC+9)
export function isNightBlocked(now: Date = new Date()): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= 21 || kstHour < 8;
}

// Keep only customers with active ad consent for the given channel.
export async function filterByConsent<T extends { id: string }>(
  customers: T[],
  channel: ConsentChannel
): Promise<T[]> {
  if (customers.length === 0) return [];

  const consentType =
    channel === "sms"
      ? "ad_sms"
      : channel === "kakao"
      ? "ad_kakao"
      : "ad_email";

  const db = getServerClient();
  const ids = customers.map((c) => c.id);

  const { data, error } = await db
    .from("consents")
    .select("customer_id")
    .in("customer_id", ids)
    .eq("type", consentType)
    .eq("agreed", true)
    .is("revoked_at", null);

  if (error) throw error;

  const consented = new Set((data ?? []).map((r: { customer_id: string }) => r.customer_id));
  return customers.filter((c) => consented.has(c.id));
}

// Daily cap: max 1000 messages per store per day.
const DAILY_CAP = 1000;

export async function dailyCapOk(storeLinkId: string): Promise<boolean> {
  const db = getServerClient();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("store_link_id", storeLinkId)
    .gte("created_at", dayStart.toISOString());

  if (error) throw error;
  return (count ?? 0) < DAILY_CAP;
}

// Deduplication: skip if same customer received same template within `windowMs`.
export async function isDuplicate(
  customerId: string,
  templateId: string,
  windowMs: number
): Promise<boolean> {
  const db = getServerClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("customer_id", customerId)
    .eq("template_id", templateId)
    .gte("created_at", since)
    .limit(1);

  if (error) throw error;
  return (data ?? []).length > 0;
}
