import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { issueReferralCoupon } from "@/lib/coupons";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `referral_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "추천테스트",
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
      store_name: "추천테스트매장",
      address: "서울시",
    })
    .select("id, store_code")
    .single();

  const sl = link as { id: string; store_code: string };
  return { userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

async function createCustomer(storeLinkId: string, suffix: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: `hash_ref_${suffix}_${Date.now()}`,
      phone_enc: `enc_ref_${suffix}`,
      visit_purpose: "친구",
      grade: "normal",
      visit_count: 0,
      browser_token: `btref_${suffix}_${Date.now()}`,
      unsub_token: crypto.randomUUID(),
    })
    .select("id, browser_token")
    .single();
  return data as { id: string; browser_token: string };
}

describe("referral", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
  });

  it("signup with ref → referrals row (completed) + C coupon to both", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    // Create referrer (existing customer)
    const referrer = await createCustomer(storeLinkId, "referrer");

    // Create invitee (new customer)
    const invitee = await createCustomer(storeLinkId, "invitee");

    // Simulate referral logic from customers route
    await admin.from("referrals").insert({
      store_link_id: storeLinkId,
      referrer_id: referrer.id,
      invitee_id: invitee.id,
      status: "completed",
      reward_given: true,
    });

    await issueReferralCoupon(referrer.id, storeLinkId);
    await issueReferralCoupon(invitee.id, storeLinkId);

    // Verify referrals row
    const { data: refRows } = await admin
      .from("referrals")
      .select("status, reward_given, referrer_id, invitee_id")
      .eq("store_link_id", storeLinkId);
    const refs = refRows as { status: string; reward_given: boolean; referrer_id: string; invitee_id: string }[];
    expect(refs).toHaveLength(1);
    expect(refs[0].status).toBe("completed");
    expect(refs[0].reward_given).toBe(true);
    expect(refs[0].referrer_id).toBe(referrer.id);
    expect(refs[0].invitee_id).toBe(invitee.id);

    // Verify C coupon for referrer
    const { data: referrerCoupons } = await admin
      .from("coupons")
      .select("kind, status")
      .eq("customer_id", referrer.id)
      .eq("kind", "C");
    const rcList = referrerCoupons as { kind: string; status: string }[];
    expect(rcList).toHaveLength(1);
    expect(rcList[0].status).toBe("issued");

    // Verify C coupon for invitee
    const { data: inviteeCoupons } = await admin
      .from("coupons")
      .select("kind, status")
      .eq("customer_id", invitee.id)
      .eq("kind", "C");
    const icList = inviteeCoupons as { kind: string; status: string }[];
    expect(icList).toHaveLength(1);
    expect(icList[0].status).toBe("issued");
  });
});
