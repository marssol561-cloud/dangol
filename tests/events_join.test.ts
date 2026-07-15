import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createParticipation } from "@/lib/events";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const TS = Date.now();
let ownerId: string;
let storeLinkId: string;
let storeCode: string;
let noEventStoreCode: string;
let noEventStoreLinkId: string;
let activeEventId: string;
const createdCustomerIds: string[] = [];

const FULL_CONSENTS = { required: true, thirdparty: true, ad_sms: false, ad_kakao: false, ad_email: false };

beforeAll(async () => {
  const admin = adminClient();

  const { data: o } = await admin.auth.admin.createUser({
    email: `evjoin-owner-${TS}@test.local`,
    password: "EvJoinTest123!",
    email_confirm: true,
  });
  ownerId = o.user!.id;

  storeCode = "EVJ1" + TS.toString().slice(-6);
  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: storeCode, store_name: "이벤트참여테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  const { data: ev } = await admin
    .from("events")
    .insert({ store_link_id: storeLinkId, type: "onsite", title: "참여테스트이벤트", status: "active", reward_benefit: "혜택" })
    .select("id")
    .single();
  activeEventId = (ev as { id: string }).id;

  noEventStoreCode = "EVJ2" + TS.toString().slice(-6);
  const { data: sl2 } = await admin
    .from("store_links")
    .insert({ store_code: noEventStoreCode, store_name: "이벤트없음테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  noEventStoreLinkId = (sl2 as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  if (createdCustomerIds.length) {
    await admin.from("event_participations").delete().in("customer_id", createdCustomerIds);
    await admin.from("consents").delete().in("customer_id", createdCustomerIds);
    await admin.from("customers").delete().in("id", createdCustomerIds);
  }
  await admin.from("events").delete().eq("id", activeEventId);
  await admin.from("store_links").delete().in("id", [storeLinkId, noEventStoreLinkId]);
  await admin.auth.admin.deleteUser(ownerId);
});

describe("join_creates_pending", () => {
  it("event-join with both consents → pending participation, NO coupon issued", async () => {
    const admin = adminClient();
    const identifier = `010${TS}1`;
    const result = await createParticipation(admin, {
      storeCode,
      channel: "phone",
      identifier,
      consents: FULL_CONSENTS,
    });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.status).toBe("pending");

    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("store_link_id", storeLinkId)
      .eq("phone_hash", (await import("@/lib/crypto")).hashPII(identifier, "phone"))
      .single();
    const customerId = (customer as { id: string }).id;
    createdCustomerIds.push(customerId);

    const { data: participationRow } = await admin
      .from("event_participations")
      .select("status")
      .eq("event_id", activeEventId)
      .eq("customer_id", customerId)
      .single();
    expect((participationRow as { status: string }).status).toBe("pending");

    const { count: couponCount } = await admin
      .from("coupons")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    expect(couponCount ?? 0).toBe(0);
  });
});

describe("both_consents_enforced", () => {
  it("missing thirdparty → thirdparty_required", async () => {
    const admin = adminClient();
    const identifier = `010${TS}2`;
    const result = await createParticipation(admin, {
      storeCode,
      channel: "phone",
      identifier,
      consents: { ...FULL_CONSENTS, thirdparty: false },
    });
    expect("error" in result && result.error).toBe("thirdparty_required");
  });

  it("missing required → consent_required", async () => {
    const admin = adminClient();
    const identifier = `010${TS}3`;
    const result = await createParticipation(admin, {
      storeCode,
      channel: "phone",
      identifier,
      consents: { ...FULL_CONSENTS, required: false },
    });
    expect("error" in result && result.error).toBe("consent_required");
  });
});

describe("one_per_event", () => {
  it("second join for same (event, customer) returns existing status, no duplicate row", async () => {
    const admin = adminClient();
    const identifier = `010${TS}4`;

    const first = await createParticipation(admin, { storeCode, channel: "phone", identifier, consents: FULL_CONSENTS });
    if ("error" in first) throw new Error(`unexpected error: ${first.error}`);
    expect(first.status).toBe("pending");

    const second = await createParticipation(admin, { storeCode, channel: "phone", identifier, consents: FULL_CONSENTS });
    if ("error" in second) throw new Error(`unexpected error: ${second.error}`);
    expect(second.status).toBe("pending");

    const { hashPII } = await import("@/lib/crypto");
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("store_link_id", storeLinkId)
      .eq("phone_hash", hashPII(identifier, "phone"))
      .single();
    const customerId = (customer as { id: string }).id;
    createdCustomerIds.push(customerId);

    const { data: rows } = await admin
      .from("event_participations")
      .select("id")
      .eq("event_id", activeEventId)
      .eq("customer_id", customerId);
    expect((rows ?? []).length).toBe(1);
  });
});

describe("no_active_event", () => {
  it("event-join when store has no active event → no_active_event", async () => {
    const admin = adminClient();
    const result = await createParticipation(admin, {
      storeCode: noEventStoreCode,
      channel: "phone",
      identifier: `010${TS}5`,
      consents: FULL_CONSENTS,
    });
    expect("error" in result && result.error).toBe("no_active_event");
  });
});
