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
  // Node.js crypto globalThis.crypto available in Next.js runtime
  (globalThis.crypto ?? require("crypto").webcrypto).getRandomValues(buf);
  return buf;
}

export async function issueFirstCoupon(
  customerId: string,
  storeLinkId: string
): Promise<{ id: string; code: string; benefit: string; expires_at: string }> {
  const db = getServerClient();

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const benefit = "첫 방문 환영 쿠폰";

  let coupon: { id: string; code: string; benefit: string; expires_at: string } | null = null;

  // Retry up to 10 times on code collision
  for (let i = 0; i < 10; i++) {
    const code = generateCouponCode();
    const { data, error } = await db
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: customerId,
        kind: "A",
        code,
        benefit,
        status: "issued",
        expires_at: expiresAt,
      })
      .select("id, code, benefit, expires_at")
      .single();

    if (!error && data) {
      coupon = data as { id: string; code: string; benefit: string; expires_at: string };
      break;
    }
    // If not a unique violation, rethrow
    if (error && !error.message.includes("unique")) throw error;
  }

  if (!coupon) throw new Error("쿠폰 코드 생성 실패: 10회 재시도 초과");
  return coupon;
}
