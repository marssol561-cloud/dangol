import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { hashPII, encryptPII } from "@/lib/crypto";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;
const DANGOL_DB_ANON_KEY = process.env.DANGOL_DB_ANON_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

let storeLinkId: string;
let storeLinkId2: string;
let ownerId: string;
let customerId: string;
let otherCustomerId: string;

const OWNER_EMAIL = `rls6-owner-${Date.now()}@test.local`;
const OWNER_PASSWORD = "RlsTest123!";

beforeAll(async () => {
  const admin = adminClient();
  const ts = Date.now();

  // Create owner
  const { data: ownerD } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  ownerId = ownerD.user!.id;

  // Create store 1 (owner's store)
  const { data: sl1 } = await admin
    .from("store_links")
    .insert({ store_code: "R6A" + ts.toString().slice(-5), store_name: "RLS6테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl1 as { id: string }).id;

  await new Promise((r) => setTimeout(r, 500));
  await admin.from("owners").upsert(
    { id: ownerId, email: OWNER_EMAIL, role: "owner", store_link_id: storeLinkId, terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
    { onConflict: "id" }
  );

  // Create customer in owner's store
  const { data: c1 } = await admin
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 3, last_visit_at: new Date().toISOString(), created_at: new Date().toISOString() })
    .select("id")
    .single();
  customerId = (c1 as { id: string }).id;

  // Create store 2 (another owner's store)
  const { data: sl2 } = await admin
    .from("store_links")
    .insert({ store_code: "R6B" + ts.toString().slice(-5), store_name: "남의가게RLS", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId2 = (sl2 as { id: string }).id;

  // Customer in store 2
  const { data: c2 } = await admin
    .from("customers")
    .insert({ store_link_id: storeLinkId2, grade: "normal", visit_count: 1, last_visit_at: new Date().toISOString(), created_at: new Date().toISOString() })
    .select("id")
    .single();
  otherCustomerId = (c2 as { id: string }).id;
});

describe("anon — customers table UPDATE denied", () => {
  it("anon cannot UPDATE customers memo", async () => {
    const anon = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon
      .from("customers")
      .update({ memo: "hacked" })
      .eq("id", customerId)
      .select("id");
    // Anon UPDATE should be denied: either error or empty result
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("anon cannot SELECT customers", async () => {
    const anon = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.from("customers").select("id").eq("id", customerId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });
});

describe("owner — UPDATE own customers", () => {
  it("owner can UPDATE memo on own store customer", async () => {
    const ownerDb = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { auth: { persistSession: false } });
    await ownerDb.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });

    const { error } = await ownerDb
      .from("customers")
      .update({ memo: "owner note" })
      .eq("id", customerId);
    expect(error).toBeNull();

    // Verify memo was set
    const admin = adminClient();
    const { data } = await admin.from("customers").select("memo").eq("id", customerId).single();
    expect((data as { memo: string }).memo).toBe("owner note");
  });

  it("owner cannot UPDATE customer in another store", async () => {
    const ownerDb = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { auth: { persistSession: false } });
    await ownerDb.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });

    const { data, error } = await ownerDb
      .from("customers")
      .update({ memo: "should fail" })
      .eq("id", otherCustomerId)
      .select("id");
    // RLS should block: either error or empty update result
    const blocked = error !== null || !data || (data as unknown[]).length === 0;
    expect(blocked).toBe(true);

    // Verify memo is still null in the other customer
    const admin = adminClient();
    const { data: d2 } = await admin.from("customers").select("memo").eq("id", otherCustomerId).single();
    expect((d2 as { memo: string | null }).memo).toBeNull();
  });
});

describe("007 migration — schema_version", () => {
  it("schema_version is 007", async () => {
    const admin = adminClient();
    const { data } = await admin.from("app_meta").select("value").eq("key", "schema_version").single();
    expect((data as { value: string }).value).toBe("007");
  });

  it("customers table has memo column", async () => {
    const admin = adminClient();
    const { data } = await admin.from("customers").select("memo").limit(0);
    // If memo column exists, query succeeds (data may be empty array)
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("computeGradeDisplay", () => {
  it("vip if cumulative >= 50", async () => {
    const { computeGradeDisplay } = await import("@/lib/grade");
    expect(computeGradeDisplay(50, 0)).toBe("vip");
    expect(computeGradeDisplay(60, 1)).toBe("vip");
  });

  it("vip if monthly >= 5", async () => {
    const { computeGradeDisplay } = await import("@/lib/grade");
    expect(computeGradeDisplay(10, 5)).toBe("vip");
    expect(computeGradeDisplay(0, 10)).toBe("vip");
  });

  it("regular if cumulative >= 20 (and not vip)", async () => {
    const { computeGradeDisplay } = await import("@/lib/grade");
    expect(computeGradeDisplay(20, 0)).toBe("regular");
    expect(computeGradeDisplay(40, 1)).toBe("regular");
  });

  it("regular if monthly >= 2 (and not vip)", async () => {
    const { computeGradeDisplay } = await import("@/lib/grade");
    expect(computeGradeDisplay(5, 2)).toBe("regular");
    expect(computeGradeDisplay(0, 3)).toBe("regular");
  });

  it("normal otherwise", async () => {
    const { computeGradeDisplay } = await import("@/lib/grade");
    expect(computeGradeDisplay(0, 0)).toBe("normal");
    expect(computeGradeDisplay(19, 1)).toBe("normal");
  });
});
