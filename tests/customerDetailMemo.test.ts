import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { decryptPII, encryptPII } from "@/lib/crypto";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

let storeLinkId: string;
let customerId: string;
let ownerId: string;

beforeAll(async () => {
  const admin = adminClient();
  const ts = Date.now();

  const { data: userD } = await admin.auth.admin.createUser({
    email: `detailmemo-${ts}@test.local`,
    password: "Test1234!",
    email_confirm: true,
  });
  ownerId = userD.user!.id;

  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: "DM" + ts.toString().slice(-5), store_name: "메모테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  await admin.from("owners").update({ store_link_id: storeLinkId, role: "owner" }).eq("id", ownerId);
  await admin.from("stamps_rewards").insert({ store_link_id: storeLinkId, required_count: 10, reward_desc: "쿠폰" });

  const { data: c } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 3,
      last_visit_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  customerId = (c as { id: string }).id;

  // Add visits
  await admin.from("visits").insert([
    { store_link_id: storeLinkId, customer_id: customerId, visited_at: new Date().toISOString(), stamp_delta: 1, source: "checkin" },
    { store_link_id: storeLinkId, customer_id: customerId, visited_at: new Date(Date.now() - 86400000).toISOString(), stamp_delta: 1, source: "checkin" },
  ]);

  // Add a message
  await admin.from("messages").insert({
    store_link_id: storeLinkId,
    customer_id: customerId,
    channel: "sms",
    template_id: "stamp_near",
    status: "sent",
    sent_at: new Date(Date.now() - 3600000).toISOString(),
  });
});

describe("customer detail", () => {
  it("memo is null initially", async () => {
    const admin = adminClient();
    const { data } = await admin.from("customers").select("memo").eq("id", customerId).single();
    expect((data as { memo: string | null }).memo).toBeNull();
  });

  it("memo can be updated via service_role", async () => {
    const admin = adminClient();
    const { error } = await admin.from("customers").update({ memo: "단골 사장님 단골" }).eq("id", customerId);
    expect(error).toBeNull();

    const { data } = await admin.from("customers").select("memo").eq("id", customerId).single();
    expect((data as { memo: string }).memo).toBe("단골 사장님 단골");
  });

  it("memo persists correctly", async () => {
    const admin = adminClient();
    await admin.from("customers").update({ memo: "VIP 행사 초대 대상" }).eq("id", customerId);
    const { data } = await admin.from("customers").select("memo").eq("id", customerId).single();
    expect((data as { memo: string }).memo).toBe("VIP 행사 초대 대상");
  });

  it("memo can be cleared (set to null)", async () => {
    const admin = adminClient();
    await admin.from("customers").update({ memo: null }).eq("id", customerId);
    const { data } = await admin.from("customers").select("memo").eq("id", customerId).single();
    expect((data as { memo: string | null }).memo).toBeNull();
  });
});

describe("customer scoping", () => {
  it("customer belongs to correct store_link_id", async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("customers")
      .select("store_link_id")
      .eq("id", customerId)
      .single();
    expect((data as { store_link_id: string }).store_link_id).toBe(storeLinkId);
  });

  it("visits are linked to customer", async () => {
    const admin = adminClient();
    const { count } = await admin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("message is linked to customer", async () => {
    const admin = adminClient();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe("PII in customer detail", () => {
  it("decryptPII round-trips correctly", () => {
    const original = "01099998888";
    const enc = encryptPII(original);
    expect(decryptPII(enc)).toBe(original);
  });
});
