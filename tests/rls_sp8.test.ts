import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;
const DANGOL_DB_ANON_KEY = process.env.DANGOL_DB_ANON_KEY!;

function adminDb() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function anonDb() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { auth: { persistSession: false } });
}

const TS = Date.now();
const OWNER_EMAIL = `rls8-owner-${TS}@test.local`;
const OWNER_PASSWORD = "RlsSP8Test123!";

let storeLinkId: string;
let customerId: string;
let ownerId: string;

beforeAll(async () => {
  const client = adminDb();
  const { data: od } = await client.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  ownerId = od.user!.id;

  const { data: sl } = await client
    .from("store_links")
    .insert({
      store_code: "RLS8" + TS.toString().slice(-5),
      store_name: "RLS-SP8-Test",
      owner_id: ownerId,
      master_store_id: "00000000-0000-0000-0000-000000000005",
      address: "",
    })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  const { data: c } = await client
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: `rls8-${TS}` })
    .select("id")
    .single();
  customerId = (c as { id: string }).id;

  await client.from("consents").insert({
    customer_id: customerId, store_link_id: storeLinkId,
    type: "required", agreed: true, agreed_at: new Date().toISOString(),
  });
});

afterAll(async () => {
  const client = adminDb();
  await client.from("consents").delete().eq("customer_id", customerId);
  await client.from("customers").delete().eq("id", customerId);
  await client.from("store_links").delete().eq("id", storeLinkId);
  await client.auth.admin.deleteUser(ownerId);
});

describe("RLS SP-8 — customers (personal data)", () => {
  it("anon CANNOT read customers", async () => {
    const { data, error } = await anonDb()
      .from("customers")
      .select("id")
      .eq("id", customerId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });
});

describe("RLS SP-8 — consents (personal data)", () => {
  it("anon CANNOT read consents", async () => {
    const { data, error } = await anonDb()
      .from("consents")
      .select("id")
      .eq("customer_id", customerId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });
});

describe("RLS SP-8 — consent_versions (public text)", () => {
  it("anon CAN read consent_versions", async () => {
    const { data, error } = await anonDb()
      .from("consent_versions")
      .select("type, version")
      .eq("type", "required");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("anon CANNOT INSERT into consent_versions", async () => {
    const { error } = await anonDb()
      .from("consent_versions")
      .insert({ type: "required", version: 999, content: "hack attempt" });
    expect(error).not.toBeNull();
  });
});

describe("RLS SP-8 — customers.deleted_at (new column)", () => {
  it("service_role can set and read deleted_at", async () => {
    const now = new Date().toISOString();
    await adminDb().from("customers").update({ deleted_at: now }).eq("id", customerId);
    const { data } = await adminDb()
      .from("customers")
      .select("deleted_at")
      .eq("id", customerId)
      .single();
    expect((data as { deleted_at: string | null }).deleted_at).not.toBeNull();

    // Reset for cleanup
    await adminDb().from("customers").update({ deleted_at: null }).eq("id", customerId);
  });
});
