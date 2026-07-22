import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { checkInCustomer } from "@/lib/checkin";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `checkin_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "체크인테스트",
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
      store_name: "체크인테스트매장",
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
      phone_hash: `hash_${browserToken}`,
      phone_enc: `enc_${browserToken}`,
      visit_purpose: "친구",
      grade: "normal",
      visit_count: 0,
      browser_token: browserToken,
      unsub_token: crypto.randomUUID(),
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

describe("checkInCustomer", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
  });

  it("returning check-in → visit+1, accrued=true", async () => {
    const { userId, storeLinkId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;

    const token = `bt_${Date.now()}`;
    const customerId = await createCustomer(storeLinkId, token);

    const result = await checkInCustomer(token, storeCode);
    expect(result.accrued).toBe(true);
    if (!result.accrued) return;

    expect(result.visit_count).toBe(1);

    // Verify visit row created
    const admin = adminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("stamp_delta, source")
      .eq("customer_id", customerId);
    expect(visits).toHaveLength(1);
    expect((visits![0] as { stamp_delta: number }).stamp_delta).toBe(1);
    expect((visits![0] as { source: string }).source).toBe("checkin");
  });

  it("2nd check-in within 6h → accrued=false, reason=too_soon, no new visit row", async () => {
    const { userId, storeLinkId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;

    const token = `bt2_${Date.now()}`;
    await createCustomer(storeLinkId, token);

    // First check-in
    await checkInCustomer(token, storeCode);

    // Second check-in (immediate, within 6h)
    const result2 = await checkInCustomer(token, storeCode);
    expect(result2.accrued).toBe(false);
    if (!result2.accrued) {
      expect(result2.reason).toBe("too_soon");
    }

    // Still only 1 visit row
    const admin = adminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("store_link_id", storeLinkId);
    expect(visits).toHaveLength(1);
  });

  it("unknown browser_token → accrued=false, reason=no_customer", async () => {
    const { userId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;

    const result = await checkInCustomer("nonexistent_token", storeCode);
    expect(result.accrued).toBe(false);
    if (!result.accrued) {
      expect(result.reason).toBe("no_customer");
    }
  });
});
