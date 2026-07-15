import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { linkUnifiedIfConsented } from "@/lib/unified";
import { hashPII } from "@/lib/crypto";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const TS = Date.now();

let storeLinkId: string;
let customerWithConsent: string;
let customerWithoutConsent: string;

beforeAll(async () => {
  const db = adminClient();

  // Create a store
  const { data: sl } = await db
    .from("store_links")
    .insert({
      store_code: "UL" + TS.toString().slice(-6),
      store_name: "UnifiedLink테스트",
      owner_id: (await db.auth.admin.createUser({ email: `ulowner-${TS}@test.local`, password: "Pw123456!", email_confirm: true })).data.user!.id,
      master_store_id: crypto.randomUUID(),
      address: "",
    })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  // Customer WITH thirdparty consent
  const { data: c1 } = await db
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID() })
    .select("id")
    .single();
  customerWithConsent = (c1 as { id: string }).id;

  // Customer WITHOUT thirdparty consent
  const { data: c2 } = await db
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID() })
    .select("id")
    .single();
  customerWithoutConsent = (c2 as { id: string }).id;
});

afterAll(async () => {
  const db = adminClient();
  await db.from("customers").delete().eq("store_link_id", storeLinkId);
  await db.from("unified_customers").delete().like("identifier_hash", `ul-${TS}%`);
  await db.from("store_links").delete().eq("id", storeLinkId);
});

describe("linkUnifiedIfConsented", () => {
  it("customer WITH thirdparty consent → linked to unified_customers", async () => {
    const hash = hashPII(`ul-${TS}-phone1`, "phone");
    await linkUnifiedIfConsented(customerWithConsent, hash, storeLinkId, { thirdparty: true });

    const db = adminClient();
    const { data: cust } = await db
      .from("customers")
      .select("unified_id")
      .eq("id", customerWithConsent)
      .single();

    expect((cust as { unified_id: string | null }).unified_id).not.toBeNull();

    // unified_customers row exists
    const { data: uni } = await db
      .from("unified_customers")
      .select("id, store_count")
      .eq("identifier_hash", hash)
      .maybeSingle();
    expect(uni).not.toBeNull();
    expect((uni as { store_count: number }).store_count).toBeGreaterThanOrEqual(1);
  });

  it("customer WITHOUT thirdparty consent → NOT linked", async () => {
    const hash = hashPII(`ul-${TS}-phone2`, "phone");
    await linkUnifiedIfConsented(customerWithoutConsent, hash, storeLinkId, { thirdparty: false });

    const db = adminClient();
    const { data: cust } = await db
      .from("customers")
      .select("unified_id")
      .eq("id", customerWithoutConsent)
      .single();

    expect((cust as { unified_id: string | null }).unified_id).toBeNull();

    // No unified_customers row for this hash
    const { data: uni } = await db
      .from("unified_customers")
      .select("id")
      .eq("identifier_hash", hash)
      .maybeSingle();
    expect(uni).toBeNull();
  });
});
