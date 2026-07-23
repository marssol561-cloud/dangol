import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createParticipation, getParticipationStatus } from "@/lib/events";
import { hashPII } from "@/lib/crypto";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}

const TS = Date.now();
let ownerId: string;
let storeLinkId: string;
let storeCode: string;
let eventId: string;
let customerId: string;
const identifier = `010${TS}7`;

beforeAll(async () => {
  const admin = adminClient();

  const { data: o } = await admin.auth.admin.createUser({
    email: `evret-owner-${TS}@test.local`,
    password: "EvRetTest123!",
    email_confirm: true,
  });
  ownerId = o.user!.id;

  storeCode = "EVR3" + TS.toString().slice(-6);
  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: storeCode, store_name: "재방문분기테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  const { data: ev } = await admin
    .from("events")
    .insert({ store_link_id: storeLinkId, type: "onsite", title: "재방문분기이벤트", status: "active", reward_benefit: "혜택" })
    .select("id")
    .single();
  eventId = (ev as { id: string }).id;

  // Pre-existing customer with BOTH mandatory consents already agreed — mirrors a returning
  // 평시 signup that happened before this event existed.
  const { data: c } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: hashPII(identifier, "phone"),
      phone_enc: "enc",
      grade: "normal",
      visit_count: 3,
      browser_token: `evr3-bt-${TS}`,
      unsub_token: crypto.randomUUID(),
    })
    .select("id")
    .single();
  customerId = (c as { id: string }).id;

  await admin.from("consents").insert([
    { customer_id: customerId, store_link_id: storeLinkId, type: "required", agreed: true, agreed_at: new Date().toISOString() },
    { customer_id: customerId, store_link_id: storeLinkId, type: "thirdparty", agreed: true, agreed_at: new Date().toISOString() },
  ]);
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("event_participations").delete().eq("customer_id", customerId);
  await admin.from("consents").delete().eq("customer_id", customerId);
  await admin.from("customers").delete().eq("id", customerId);
  await admin.from("events").delete().eq("id", eventId);
  await admin.from("store_links").delete().eq("id", storeLinkId);
  await admin.auth.admin.deleteUser(ownerId);
});

describe("returning_branch", () => {
  it("event-status.existingConsents both true for a returning customer (by browser_token)", async () => {
    const admin = adminClient();
    const result = await getParticipationStatus(admin, storeCode, { browserToken: `evr3-bt-${TS}` });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.existingConsents).toEqual({ required: true, thirdparty: true });
    expect(result.participation).toBeNull(); // hasn't joined this event yet
  });

  it("event-status.existingConsents both true for a returning customer (by channel+identifier)", async () => {
    const admin = adminClient();
    const result = await getParticipationStatus(admin, storeCode, { channel: "phone", identifier });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.existingConsents).toEqual({ required: true, thirdparty: true });
  });

  it("join succeeds without resubmitting consents (both false in the request)", async () => {
    const admin = adminClient();
    const result = await createParticipation(admin, {
      storeCode,
      channel: "phone",
      identifier,
      consents: { required: false, thirdparty: false, ad_sms: false, ad_kakao: false, ad_email: false },
    });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.status).toBe("pending");

    // No duplicate consent rows were inserted — still exactly 1 required + 1 thirdparty row
    const { data: consentRows } = await admin
      .from("consents")
      .select("type")
      .eq("customer_id", customerId)
      .in("type", ["required", "thirdparty"]);
    expect((consentRows ?? []).length).toBe(2);
  });
});
