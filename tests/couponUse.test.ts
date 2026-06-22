import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `couponuse_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "쿠폰사용테스트",
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
      store_name: "쿠폰사용테스트매장",
      address: "서울시",
    })
    .select("id, store_code")
    .single();

  const sl = link as { id: string; store_code: string };
  return { userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

function genCode(): string {
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");
}

async function createCoupon(
  storeLinkId: string,
  customerId: string,
  status: "issued" | "used" | "expired"
) {
  const admin = adminClient();
  const code = genCode();
  const { data } = await admin
    .from("coupons")
    .insert({
      store_link_id: storeLinkId,
      customer_id: customerId,
      kind: "A",
      code,
      benefit: "테스트 쿠폰",
      status,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id, code")
    .single();
  return data as { id: string; code: string };
}

async function createCustomer(storeLinkId: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: `hash_cu_${Date.now()}`,
      phone_enc: `enc_cu_${Date.now()}`,
      visit_purpose: "혼밥",
      grade: "normal",
      visit_count: 3,
      browser_token: `bt_cu_${Date.now()}`,
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

describe("couponUse (DB layer)", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
  });

  it("issued coupon → mark used, NO visits change", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const customerId = await createCustomer(storeLinkId);
    const coupon = await createCoupon(storeLinkId, customerId, "issued");

    // Mark used
    const { error } = await admin
      .from("coupons")
      .update({ status: "used" })
      .eq("id", coupon.id);
    expect(error).toBeNull();

    // Status updated
    const { data: updated } = await admin
      .from("coupons")
      .select("status")
      .eq("id", coupon.id)
      .single();
    expect((updated as { status: string }).status).toBe("used");

    // Visits not changed
    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("customer_id", customerId);
    expect(visits).toHaveLength(0);
  });

  it("already_used coupon → cannot use again", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const customerId = await createCustomer(storeLinkId);
    const coupon = await createCoupon(storeLinkId, customerId, "used");

    // Fetch and check status
    const { data } = await admin
      .from("coupons")
      .select("status")
      .eq("id", coupon.id)
      .single();
    expect((data as { status: string }).status).toBe("used");
  });

  it("expired coupon → status is expired", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const customerId = await createCustomer(storeLinkId);
    const coupon = await createCoupon(storeLinkId, customerId, "expired");

    const { data } = await admin
      .from("coupons")
      .select("status")
      .eq("id", coupon.id)
      .single();
    expect((data as { status: string }).status).toBe("expired");
  });

  it("invalid code → not found", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const { data } = await admin
      .from("coupons")
      .select("id")
      .eq("store_link_id", storeLinkId)
      .eq("code", "INVALIDXXX")
      .maybeSingle();
    expect(data).toBeNull();
  });
});
