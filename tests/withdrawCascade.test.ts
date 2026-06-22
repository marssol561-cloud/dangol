import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { withdrawConsent } from "@/lib/unsubscribe";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function db() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const TS = Date.now();

let storeLinkId: string;
let thirdpartyCustomerId: string;
let adCustomerId: string;
let unifiedId: string;

beforeAll(async () => {
  const client = db();
  const ownerId = (
    await client.auth.admin.createUser({
      email: `wc-owner-${TS}@test.local`,
      password: "Pw123456!",
      email_confirm: true,
    })
  ).data.user!.id;

  const { data: sl } = await client
    .from("store_links")
    .insert({
      store_code: "WC" + TS.toString().slice(-6),
      store_name: "WithdrawCascade매장",
      owner_id: ownerId,
      master_store_id: "00000000-0000-0000-0000-000000000003",
      address: "",
    })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  // Create unified row
  const { data: uni } = await client
    .from("unified_customers")
    .insert({ identifier_hash: `wc-hash-${TS}`, store_count: 2 })
    .select("id")
    .single();
  unifiedId = (uni as { id: string }).id;

  // Customer with thirdparty consent + unified link
  const { data: c1 } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 1,
      unified_id: unifiedId,
      unsub_token: `wc-tp-${TS}`,
    })
    .select("id")
    .single();
  thirdpartyCustomerId = (c1 as { id: string }).id;

  await client.from("consents").insert({
    customer_id: thirdpartyCustomerId,
    store_link_id: storeLinkId,
    type: "thirdparty",
    agreed: true,
    agreed_at: new Date().toISOString(),
  });

  // Customer with ad consent active
  const { data: c2 } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 1,
      unsub_token: `wc-ad-${TS}`,
    })
    .select("id")
    .single();
  adCustomerId = (c2 as { id: string }).id;

  await client.from("consents").insert({
    customer_id: adCustomerId,
    store_link_id: storeLinkId,
    type: "ad_sms",
    agreed: true,
    agreed_at: new Date().toISOString(),
  });
});

afterAll(async () => {
  const client = db();
  await client.from("consents").delete().in("customer_id", [thirdpartyCustomerId, adCustomerId]);
  await client.from("customers").delete().in("id", [thirdpartyCustomerId, adCustomerId]);
  await client.from("unified_customers").delete().eq("id", unifiedId).maybeSingle();
  await client.from("store_links").delete().eq("id", storeLinkId);
});

describe("thirdparty withdrawal → unified removal", () => {
  it("withdrawing thirdparty consent detaches customer from unified_customers", async () => {
    await withdrawConsent(thirdpartyCustomerId, storeLinkId, "thirdparty");

    const { data: cust } = await db()
      .from("customers")
      .select("unified_id")
      .eq("id", thirdpartyCustomerId)
      .single();

    expect((cust as { unified_id: string | null }).unified_id).toBeNull();
  });

  it("thirdparty withdrawal decrements unified_customers.store_count", async () => {
    const { data: uni } = await db()
      .from("unified_customers")
      .select("store_count")
      .eq("id", unifiedId)
      .maybeSingle();

    // Was 2, should be 1 now
    expect((uni as { store_count: number }).store_count).toBe(1);
  });

  it("thirdparty consent is marked revoked", async () => {
    const { data } = await db()
      .from("consents")
      .select("agreed, revoked_at")
      .eq("customer_id", thirdpartyCustomerId)
      .eq("type", "thirdparty")
      .maybeSingle();

    const row = data as { agreed: boolean; revoked_at: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.agreed).toBe(false);
    expect(row!.revoked_at).not.toBeNull();
  });
});

describe("ad withdrawal → send exclusion", () => {
  it("ad consent withdrawal sets revoked_at — customer excluded from sends", async () => {
    await withdrawConsent(adCustomerId, storeLinkId, "ad_sms");

    const { data } = await db()
      .from("consents")
      .select("agreed, revoked_at")
      .eq("customer_id", adCustomerId)
      .eq("type", "ad_sms")
      .maybeSingle();

    const row = data as { agreed: boolean; revoked_at: string | null } | null;
    expect(row!.agreed).toBe(false);
    expect(row!.revoked_at).not.toBeNull();
  });
});
