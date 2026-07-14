import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;
const DANGOL_DB_ANON_KEY = process.env.DANGOL_DB_ANON_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function anonClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { auth: { persistSession: false } });
}

const TS = Date.now();
const OWNER1_EMAIL = `evrls-owner1-${TS}@test.local`;
const OWNER1_PASSWORD = "EvRlsTest123!";

let owner1Id: string;
let owner2Id: string;
let storeLink1Id: string;
let storeLink2Id: string;
let event1Id: string;
let event2Id: string;
let customer1Id: string;
let participation1Id: string;
let tag1Id: string;

beforeAll(async () => {
  const admin = adminClient();

  const { data: o1 } = await admin.auth.admin.createUser({
    email: OWNER1_EMAIL,
    password: OWNER1_PASSWORD,
    email_confirm: true,
  });
  owner1Id = o1.user!.id;

  const { data: o2 } = await admin.auth.admin.createUser({
    email: `evrls-owner2-${TS}@test.local`,
    password: "EvRlsTest123!",
    email_confirm: true,
  });
  owner2Id = o2.user!.id;

  await new Promise((r) => setTimeout(r, 500));

  const { data: sl1 } = await admin
    .from("store_links")
    .insert({ store_code: "EVR1" + TS.toString().slice(-5), store_name: "EVRLS매장1", owner_id: owner1Id, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLink1Id = (sl1 as { id: string }).id;

  const { data: sl2 } = await admin
    .from("store_links")
    .insert({ store_code: "EVR2" + TS.toString().slice(-5), store_name: "EVRLS매장2", owner_id: owner2Id, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLink2Id = (sl2 as { id: string }).id;

  await admin.from("owners").upsert(
    { id: owner1Id, email: OWNER1_EMAIL, role: "owner", store_link_id: storeLink1Id, terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
    { onConflict: "id" }
  );

  const { data: e1 } = await admin
    .from("events")
    .insert({ store_link_id: storeLink1Id, type: "onsite", title: "매장1이벤트", status: "active" })
    .select("id")
    .single();
  event1Id = (e1 as { id: string }).id;

  const { data: e2 } = await admin
    .from("events")
    .insert({ store_link_id: storeLink2Id, type: "onsite", title: "매장2이벤트", status: "active" })
    .select("id")
    .single();
  event2Id = (e2 as { id: string }).id;

  const { data: c1 } = await admin
    .from("customers")
    .insert({ store_link_id: storeLink1Id, grade: "normal", visit_count: 0, browser_token: `evrls-bt-${TS}`, unsub_token: `evrls-unsub-${TS}` })
    .select("id")
    .single();
  customer1Id = (c1 as { id: string }).id;

  const { data: p1 } = await admin
    .from("event_participations")
    .insert({ event_id: event1Id, customer_id: customer1Id, store_link_id: storeLink1Id })
    .select("id")
    .single();
  participation1Id = (p1 as { id: string }).id;

  const { data: t1 } = await admin
    .from("customer_tags")
    .insert({ customer_id: customer1Id, store_link_id: storeLink1Id, tag: "vip-candidate" })
    .select("id")
    .single();
  tag1Id = (t1 as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("customer_tags").delete().eq("id", tag1Id);
  await admin.from("event_participations").delete().eq("id", participation1Id);
  await admin.from("events").delete().in("id", [event1Id, event2Id]);
  await admin.from("customers").delete().eq("id", customer1Id);
  await admin.from("store_links").delete().in("id", [storeLink1Id, storeLink2Id]);
  await admin.auth.admin.deleteUser(owner1Id);
  await admin.auth.admin.deleteUser(owner2Id);
});

describe("RLS SP-E1 — anon denied on all event tables", () => {
  it("anon cannot SELECT events", async () => {
    const { data, error } = await anonClient().from("events").select("id").eq("id", event1Id);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("anon cannot SELECT event_participations", async () => {
    const { data, error } = await anonClient().from("event_participations").select("id").eq("id", participation1Id);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("anon cannot SELECT customer_tags", async () => {
    const { data, error } = await anonClient().from("customer_tags").select("id").eq("id", tag1Id);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });
});

describe("RLS SP-E1 — owner sees only own store's events", () => {
  it("owner1 sees store1 event, not store2 event", async () => {
    const ownerDb = anonClient();
    await ownerDb.auth.signInWithPassword({ email: OWNER1_EMAIL, password: OWNER1_PASSWORD });

    const { data, error } = await ownerDb.from("events").select("id, store_link_id");
    expect(error).toBeNull();

    const rows = (data ?? []) as { id: string; store_link_id: string }[];
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(event1Id);
    expect(ids).not.toContain(event2Id);
    for (const r of rows) expect(r.store_link_id).toBe(storeLink1Id);

    await ownerDb.auth.signOut();
  });
});
