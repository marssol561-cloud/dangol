import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { checkInCustomer } from "@/lib/checkin";
import { issueReturningCoupon } from "@/lib/coupons";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `retcoupon_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "재방문쿠폰테스트",
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  await new Promise((r) => setTimeout(r, 1000));
  const userId = u.user!.id;

  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({
      owner_id: userId,
      master_store_id: crypto.randomUUID(),
      store_code: code,
      store_name: "재방문쿠폰테스트매장",
      address: "서울시",
    })
    .select("id, store_code")
    .single();

  const sl = link as { id: string; store_code: string };
  return { userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

async function createCustomer(storeLinkId: string, browserToken: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: `hash_rc_${browserToken}`,
      phone_enc: `enc_rc_${browserToken}`,
      visit_purpose: "혼밥",
      grade: "normal",
      visit_count: 0,
      browser_token: browserToken,
      unsub_token: crypto.randomUUID(),
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

describe("returningCoupon", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
  });

  it("check-in issues B coupon", async () => {
    const { userId, storeLinkId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;

    const token = `btrc_${Date.now()}`;
    await createCustomer(storeLinkId, token);

    const result = await checkInCustomer(token, storeCode);
    expect(result.accrued).toBe(true);
    if (!result.accrued) return;

    // Coupon B should be issued
    expect(result.coupon).toBeDefined();

    const admin = adminClient();
    const { data: coupons } = await admin
      .from("coupons")
      .select("kind, status")
      .eq("store_link_id", storeLinkId);
    const cs = coupons as { kind: string; status: string }[];
    expect(cs.some((c) => c.kind === "B" && c.status === "issued")).toBe(true);
  });

  it("if unused B exists → issueReturningCoupon returns null, no duplicate", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;

    const token = `btrc2_${Date.now()}`;
    const customerId = await createCustomer(storeLinkId, token);

    // Manually issue an existing unused B coupon
    const admin = adminClient();
    const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const existingCode = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");
    await admin.from("coupons").insert({
      store_link_id: storeLinkId,
      customer_id: customerId,
      kind: "B",
      code: existingCode,
      benefit: "기존 재방문 쿠폰",
      status: "issued",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Try to issue another B
    const result = await issueReturningCoupon(customerId, storeLinkId);
    expect(result).toBeNull();

    // Still only 1 B coupon
    const { data: bCoupons } = await admin
      .from("coupons")
      .select("id")
      .eq("customer_id", customerId)
      .eq("kind", "B")
      .eq("status", "issued");
    expect(bCoupons).toHaveLength(1);
  });
});
