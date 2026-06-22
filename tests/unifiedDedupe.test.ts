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

let store1Id: string;
let store2Id: string;
let customer1Id: string;
let customer2Id: string;
const SHARED_PHONE = `01012345${TS.toString().slice(-4)}`;

beforeAll(async () => {
  const db = adminClient();
  const ownerId = (
    await db.auth.admin.createUser({
      email: `dedupe-owner-${TS}@test.local`,
      password: "Pw123456!",
      email_confirm: true,
    })
  ).data.user!.id;

  const [{ data: sl1 }, { data: sl2 }] = await Promise.all([
    db
      .from("store_links")
      .insert({
        store_code: "DD1" + TS.toString().slice(-5),
        store_name: "Dedupe매장1",
        owner_id: ownerId,
        master_store_id: crypto.randomUUID(),
        address: "",
      })
      .select("id")
      .single(),
    db
      .from("store_links")
      .insert({
        store_code: "DD2" + TS.toString().slice(-5),
        store_name: "Dedupe매장2",
        owner_id: ownerId,
        master_store_id: crypto.randomUUID(),
        address: "",
      })
      .select("id")
      .single(),
  ]);
  store1Id = (sl1 as { id: string }).id;
  store2Id = (sl2 as { id: string }).id;

  // One customer per store, same phone
  const [{ data: c1 }, { data: c2 }] = await Promise.all([
    db.from("customers").insert({ store_link_id: store1Id, grade: "normal", visit_count: 0 }).select("id").single(),
    db.from("customers").insert({ store_link_id: store2Id, grade: "normal", visit_count: 0 }).select("id").single(),
  ]);
  customer1Id = (c1 as { id: string }).id;
  customer2Id = (c2 as { id: string }).id;
});

afterAll(async () => {
  const db = adminClient();
  await db.from("customers").delete().in("store_link_id", [store1Id, store2Id]);
  await db.from("store_links").delete().in("id", [store1Id, store2Id]);
});

describe("unified_customers deduplication across stores", () => {
  it("same identifier across 2 stores → ONE unified row, store_count=2", async () => {
    const hash = hashPII(SHARED_PHONE, "phone");

    // Link from store 1
    await linkUnifiedIfConsented(customer1Id, hash, store1Id, { thirdparty: true });
    // Link from store 2 (same hash = same person)
    await linkUnifiedIfConsented(customer2Id, hash, store2Id, { thirdparty: true });

    const db = adminClient();

    // Both customers should point to the same unified_id
    const [{ data: c1 }, { data: c2 }] = await Promise.all([
      db.from("customers").select("unified_id").eq("id", customer1Id).single(),
      db.from("customers").select("unified_id").eq("id", customer2Id).single(),
    ]);

    const uid1 = (c1 as { unified_id: string | null }).unified_id;
    const uid2 = (c2 as { unified_id: string | null }).unified_id;

    expect(uid1).not.toBeNull();
    expect(uid2).not.toBeNull();
    expect(uid1).toBe(uid2);

    // Exactly ONE unified_customers row for this hash
    const { data: uniRows } = await db
      .from("unified_customers")
      .select("id, store_count")
      .eq("identifier_hash", hash);

    expect((uniRows as unknown[]).length).toBe(1);
    expect((uniRows as { store_count: number }[])[0].store_count).toBe(2);
  });
});
