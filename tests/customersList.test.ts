import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getCustomersList } from "@/lib/dashboard";
import { hashPII, encryptPII } from "@/lib/crypto";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

let storeLinkId: string;
let storeLinkId2: string;
let ownerId: string;

beforeAll(async () => {
  const admin = adminClient();
  const ts = Date.now();

  const { data: userD } = await admin.auth.admin.createUser({
    email: `custlist-${ts}@test.local`,
    password: "Test1234!",
    email_confirm: true,
  });
  ownerId = userD.user!.id;

  const { data: sl1 } = await admin
    .from("store_links")
    .insert({ store_code: "CL1" + ts.toString().slice(-5), store_name: "고객목록테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl1 as { id: string }).id;

  const { data: sl2 } = await admin
    .from("store_links")
    .insert({ store_code: "CL2" + ts.toString().slice(-5), store_name: "남의가게2", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId2 = (sl2 as { id: string }).id;

  // Insert customers in store 1
  const phone = "01012345678";
  const rows = [
    {
      store_link_id: storeLinkId,
      grade: "vip",
      visit_count: 55,
      phone_hash: hashPII(phone, "phone"),
      phone_enc: encryptPII(phone),
      last_visit_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      unsub_token: crypto.randomUUID(),
    },
    {
      store_link_id: storeLinkId,
      grade: "regular",
      visit_count: 22,
      email_hash: hashPII("test@example.com", "email"),
      email_enc: encryptPII("test@example.com"),
      last_visit_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      unsub_token: crypto.randomUUID(),
    },
    {
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 3,
      last_visit_at: new Date(Date.now() - 70 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 70 * 86400000).toISOString(),
      unsub_token: crypto.randomUUID(),
    },
  ];
  await admin.from("customers").insert(rows);

  // Insert customer in store 2 (should NOT appear in store 1 results)
  await admin.from("customers").insert({
    store_link_id: storeLinkId2,
    grade: "normal",
    visit_count: 1,
    last_visit_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    unsub_token: crypto.randomUUID(),
  });
});

describe("getCustomersList", () => {
  it("returns only customers scoped to storeLinkId", async () => {
    const list = await getCustomersList(storeLinkId, {});
    const storeIds = new Set(list.map(() => storeLinkId));
    expect(storeIds.size).toBe(1);
    // Store 2 customer should not appear
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it("grade filter returns only matching grade", async () => {
    const list = await getCustomersList(storeLinkId, { grade: "vip" });
    expect(list.every((c) => c.grade === "vip")).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("channel filter returns only customers with phone", async () => {
    const list = await getCustomersList(storeLinkId, { channel: "phone" });
    expect(list.every((c) => c.channel === "phone")).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("lastVisitDays filter returns only old visits", async () => {
    const list = await getCustomersList(storeLinkId, { lastVisitDays: 60 });
    // Only the customer with last_visit 70 days ago should appear
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("contact is masked — no raw phone digits in displayContact", async () => {
    const list = await getCustomersList(storeLinkId, { channel: "phone" });
    const phoneCustomer = list.find((c) => c.channel === "phone");
    expect(phoneCustomer).toBeTruthy();
    // Masked phone should NOT be the raw value
    expect(phoneCustomer!.displayContact).not.toBe("01012345678");
    // Should look like 010-****-5678
    expect(phoneCustomer!.displayContact).toMatch(/\*{4}/);
  });

  it("no raw enc/hash fields in response", async () => {
    const list = await getCustomersList(storeLinkId, {});
    for (const c of list) {
      expect(Object.keys(c)).not.toContain("phone_enc");
      expect(Object.keys(c)).not.toContain("email_enc");
      expect(Object.keys(c)).not.toContain("kakao_enc");
      expect(Object.keys(c)).not.toContain("phone_hash");
    }
  });
});
