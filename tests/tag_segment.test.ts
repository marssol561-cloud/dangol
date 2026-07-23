import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { DangolClient } from "@/lib/dangolDb";
import { NextRequest } from "next/server";
import { resolveSegment } from "@/lib/segments";
import { sendToSegment } from "@/lib/messaging";
import { encryptPII } from "@/lib/crypto";
import { POST } from "@/app/api/messages/send/route";

process.env.SOLAPI_MOCK = "true";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}
function anonClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_ANON_KEY!, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}

async function tagCustomer(admin: DangolClient, storeLinkId: string, tag: string, extra: Record<string, unknown> = {}) {
  const { data: c } = await admin
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID(), ...extra })
    .select("id").single();
  const customerId = (c as { id: string }).id;
  await admin.from("customer_tags").insert({ customer_id: customerId, store_link_id: storeLinkId, tag });
  return customerId;
}

const TS = Date.now();
let ownerAId: string;
let ownerAEmail: string;
let storeA: string;
let storeB: string;
const createdCustomerIds: string[] = [];

let coffeeC1: string;
let coffeeC2: string;
let dessertC1: string;
let untaggedC1: string;
let otherStoreCoffeeC: string;

beforeAll(async () => {
  const admin = adminClient();

  ownerAEmail = `evtag-a-${TS}@test.local`;
  const { data: oa } = await admin.auth.admin.createUser({ email: ownerAEmail, password: "EvTagTest123!", email_confirm: true });
  ownerAId = oa.user!.id;

  const { data: sa } = await admin
    .from("store_links")
    .insert({ store_code: "EVTA" + TS.toString().slice(-5), store_name: "태그테스트매장A", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id").single();
  storeA = (sa as { id: string }).id;

  const { data: sb } = await admin
    .from("store_links")
    .insert({ store_code: "EVTB" + TS.toString().slice(-5), store_name: "태그테스트매장B", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id").single();
  storeB = (sb as { id: string }).id;

  coffeeC1 = await tagCustomer(admin, storeA, "coffee", {
    phone_enc: encryptPII("01011110001"),
    last_visit_at: new Date().toISOString(),
  });
  coffeeC2 = await tagCustomer(admin, storeA, "coffee", {
    phone_enc: encryptPII("01011110002"),
    last_visit_at: new Date().toISOString(),
  });
  dessertC1 = await tagCustomer(admin, storeA, "dessert");
  const { data: u } = await admin
    .from("customers")
    .insert({ store_link_id: storeA, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID() })
    .select("id").single();
  untaggedC1 = (u as { id: string }).id;
  otherStoreCoffeeC = await tagCustomer(admin, storeB, "coffee");

  createdCustomerIds.push(coffeeC1, coffeeC2, dessertC1, untaggedC1, otherStoreCoffeeC);

  // Ad-SMS consent for the two coffee customers in storeA (needed for send test)
  await admin.from("consents").insert([
    { customer_id: coffeeC1, store_link_id: storeA, type: "ad_sms", agreed: true, agreed_at: new Date().toISOString() },
    { customer_id: coffeeC2, store_link_id: storeA, type: "ad_sms", agreed: true, agreed_at: new Date().toISOString() },
  ]);

  // send_channels for storeA — connected, no kakao (forces sms fallback), mock mode
  await admin.from("send_channels").insert({
    store_link_id: storeA,
    provider: "solapi",
    kakao_channel_id: null,
    sender_number: "01000000000",
    api_key_enc: encryptPII("fake_solapi_key_for_testing"),
    setup_step: 4,
    connected: true,
  });
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("messages").delete().eq("store_link_id", storeA);
  await admin.from("send_channels").delete().eq("store_link_id", storeA);
  await admin.from("consents").delete().in("customer_id", [coffeeC1, coffeeC2]);
  await admin.from("customer_tags").delete().in("customer_id", createdCustomerIds);
  await admin.from("customers").delete().in("id", createdCustomerIds);
  await admin.from("store_links").delete().in("id", [storeA, storeB]);
  await admin.auth.admin.deleteUser(ownerAId);
});

describe("resolveSegment type='tag'", () => {
  it("returns exactly the store's customers holding that tag", async () => {
    const results = await resolveSegment({ storeLinkId: storeA, type: "tag", tag: "coffee" });
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual([coffeeC1, coffeeC2].sort());
  });

  it("excludes customers with a different tag and untagged customers", async () => {
    const results = await resolveSegment({ storeLinkId: storeA, type: "tag", tag: "coffee" });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(dessertC1);
    expect(ids).not.toContain(untaggedC1);
  });

  it("excludes another store's customers holding the same tag", async () => {
    const results = await resolveSegment({ storeLinkId: storeA, type: "tag", tag: "coffee" });
    expect(results.map((r) => r.id)).not.toContain(otherStoreCoffeeC);
  });

  it("returns empty when tag is omitted", async () => {
    const results = await resolveSegment({ storeLinkId: storeA, type: "tag" });
    expect(results).toHaveLength(0);
  });

  it("grade/churn segments remain unaffected by the new tag branch", async () => {
    const admin = adminClient();
    const { data: vip } = await admin
      .from("customers")
      .insert({ store_link_id: storeA, grade: "vip", visit_count: 15, unsub_token: crypto.randomUUID() })
      .select("id").single();
    const vipId = (vip as { id: string }).id;
    createdCustomerIds.push(vipId);

    const results = await resolveSegment({ storeLinkId: storeA, type: "grade", grade: "vip" });
    expect(results.map((r) => r.id)).toContain(vipId);
  });
});

describe("sendToSegment with tag", () => {
  it("sends only to customers holding that tag", async () => {
    const result = await sendToSegment(storeA, "tag", "returning_reminder", {}, "coffee");
    expect(result.sent).toBe(2);

    const admin = adminClient();
    const { data: msgs } = await admin
      .from("messages")
      .select("customer_id")
      .eq("store_link_id", storeA)
      .eq("template_id", "returning_reminder");
    const recipients = (msgs ?? []).map((m: { customer_id: string }) => m.customer_id).sort();
    expect(recipients).toEqual([coffeeC1, coffeeC2].sort());
  });
});

describe("POST /api/messages/send — tag validation", () => {
  it("segment='tag' without tag → 400", async () => {
    const anon = anonClient();
    const { data: sess } = await anon.auth.signInWithPassword({ email: ownerAEmail, password: "EvTagTest123!" });
    const accessToken = sess.session!.access_token;

    const req = new NextRequest("http://localhost/api/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ store_link_id: storeA, segment: "tag", template_id: "returning_reminder", template_vars: {} }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
