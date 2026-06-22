import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const TS = Date.now();

let store1Id: string;
let store2Id: string;
let ownerId: string;

beforeAll(async () => {
  const db = adminClient();

  const { data: ownerD } = await db.auth.admin.createUser({
    email: `agg-owner-${TS}@test.local`,
    password: "Pw123456!",
    email_confirm: true,
  });
  ownerId = ownerD.user!.id;

  const [{ data: sl1 }, { data: sl2 }] = await Promise.all([
    db
      .from("store_links")
      .insert({
        store_code: "AG1" + TS.toString().slice(-5),
        store_name: "Agg매장1",
        owner_id: ownerId,
        master_store_id: crypto.randomUUID(),
        address: "",
      })
      .select("id")
      .single(),
    db
      .from("store_links")
      .insert({
        store_code: "AG2" + TS.toString().slice(-5),
        store_name: "Agg매장2",
        owner_id: ownerId,
        master_store_id: crypto.randomUUID(),
        address: "",
      })
      .select("id")
      .single(),
  ]);
  store1Id = (sl1 as { id: string }).id;
  store2Id = (sl2 as { id: string }).id;

  // Insert 3 customers in store1, 2 in store2
  await Promise.all([
    db.from("customers").insert({ store_link_id: store1Id, grade: "normal", visit_count: 0 }),
    db.from("customers").insert({ store_link_id: store1Id, grade: "normal", visit_count: 0 }),
    db.from("customers").insert({ store_link_id: store1Id, grade: "normal", visit_count: 0 }),
    db.from("customers").insert({ store_link_id: store2Id, grade: "normal", visit_count: 0 }),
    db.from("customers").insert({ store_link_id: store2Id, grade: "normal", visit_count: 0 }),
  ]);
});

afterAll(async () => {
  const db = adminClient();
  await db.from("customers").delete().in("store_link_id", [store1Id, store2Id]);
  await db.from("store_links").delete().in("id", [store1Id, store2Id]);
  await db.auth.admin.deleteUser(ownerId);
});

describe("C1 KPI aggregation — service_role sees all stores", () => {
  it("service_role can count customers across ALL stores", async () => {
    const db = adminClient();

    const [{ count: c1 }, { count: c2 }, { count: total }] = await Promise.all([
      db.from("customers").select("id", { count: "exact", head: true }).eq("store_link_id", store1Id),
      db.from("customers").select("id", { count: "exact", head: true }).eq("store_link_id", store2Id),
      db.from("customers").select("id", { count: "exact", head: true }).in("store_link_id", [store1Id, store2Id]),
    ]);

    expect(c1).toBeGreaterThanOrEqual(3);
    expect(c2).toBeGreaterThanOrEqual(2);
    expect(total).toBeGreaterThanOrEqual(5);
    // Total must equal store1 + store2 (cross-store aggregate)
    expect(total).toBe((c1 ?? 0) + (c2 ?? 0));
  });

  it("service_role can count owners", async () => {
    const db = adminClient();
    const { count } = await db.from("owners").select("id", { count: "exact", head: true });
    expect(count).toBeGreaterThan(0);
  });
});
