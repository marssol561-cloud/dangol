import type { DangolClient } from "./dangolDb";
import { webcrypto } from "node:crypto";
import { getServerClient } from "./dangolDb";

// Base32 charset (ambiguous chars excluded — same as store_code)
const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateCouponCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += CHARSET[b % CHARSET.length];
  return code;
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  (globalThis.crypto ?? webcrypto).getRandomValues(buf);
  return buf;
}

async function insertCoupon(
  customerId: string,
  storeLinkId: string,
  kind: "A" | "B" | "C",
  benefit: string
): Promise<{ id: string; code: string; benefit: string; expires_at: string }> {
  const db = getServerClient();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  for (let i = 0; i < 10; i++) {
    const code = generateCouponCode();
    const { data, error } = await db
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: customerId,
        kind,
        code,
        benefit,
        status: "issued",
        expires_at: expiresAt,
      })
      .select("id, code, benefit, expires_at")
      .single();

    if (!error && data) return data as { id: string; code: string; benefit: string; expires_at: string };
    if (error && !error.message.includes("unique")) throw error;
  }
  throw new Error("쿠폰 코드 생성 실패: 10회 재시도 초과");
}

export async function issueFirstCoupon(
  customerId: string,
  storeLinkId: string
): Promise<{ id: string; code: string; benefit: string; expires_at: string }> {
  return insertCoupon(customerId, storeLinkId, "A", "첫 방문 환영 쿠폰");
}

export async function issueReturningCoupon(
  customerId: string,
  storeLinkId: string
): Promise<{ id: string; code: string; benefit: string; expires_at: string } | null> {
  const db = getServerClient();

  // Skip if unused B coupon already exists
  const { data: existing } = await db
    .from("coupons")
    .select("id")
    .eq("customer_id", customerId)
    .eq("store_link_id", storeLinkId)
    .eq("kind", "B")
    .eq("status", "issued")
    .maybeSingle();

  if (existing) return null;

  // Get benefit text from stamps_rewards
  const { data: policy } = await db
    .from("stamps_rewards")
    .select("service_b")
    .eq("store_link_id", storeLinkId)
    .maybeSingle();

  const benefit = (policy as { service_b?: string } | null)?.service_b ?? "재방문 감사 쿠폰";
  return insertCoupon(customerId, storeLinkId, "B", benefit);
}

export async function issueReferralCoupon(
  customerId: string,
  storeLinkId: string
): Promise<{ id: string; code: string; benefit: string; expires_at: string }> {
  const db = getServerClient();

  const { data: policy } = await db
    .from("stamps_rewards")
    .select("service_c")
    .eq("store_link_id", storeLinkId)
    .maybeSingle();

  const benefit = (policy as { service_c?: string } | null)?.service_c ?? "친구 추천 쿠폰";
  return insertCoupon(customerId, storeLinkId, "C", benefit);
}

// ============================================================
// SP-E4: staff-issued event coupon (event_id 연결) — kind='custom'.
// db는 호출자(lib/events.ts)가 전달 — 기존 insertCoupon과 달리 테스트에서
// adminClient를 직접 주입할 수 있도록 함(SP-E2/E3의 lib 함수 관례와 동일).
// ============================================================
export async function issueEventCoupon(
  db: DangolClient,
  input: { storeLinkId: string; customerId: string; eventId: string; benefit: string | null; validDays: number }
): Promise<{ id: string; code: string; benefit: string | null; expires_at: string }> {
  const expiresAt = new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000).toISOString();

  for (let i = 0; i < 10; i++) {
    const code = generateCouponCode();
    const { data, error } = await db
      .from("coupons")
      .insert({
        store_link_id: input.storeLinkId,
        customer_id: input.customerId,
        kind: "custom",
        event_id: input.eventId,
        code,
        benefit: input.benefit,
        status: "issued",
        expires_at: expiresAt,
      })
      .select("id, code, benefit, expires_at")
      .single();

    if (!error && data) return data as { id: string; code: string; benefit: string | null; expires_at: string };
    if (error && !error.message.includes("unique")) throw error;
  }
  throw new Error("이벤트 쿠폰 코드 생성 실패: 10회 재시도 초과");
}
