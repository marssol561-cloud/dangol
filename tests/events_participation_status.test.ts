import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createParticipation, getParticipationStatus, listUpcomingPreannounce } from "@/lib/events";
import { hashPII } from "@/lib/crypto";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const TS = Date.now();
let ownerId: string;
let storeLinkId: string;
let storeCode: string;
let eventId: string;
let customerId: string;
let couponId: string;
const identifier = `010${TS}9`;

const FULL_CONSENTS = { required: true, thirdparty: true, ad_sms: false, ad_kakao: false, ad_email: false };

beforeAll(async () => {
  const admin = adminClient();

  const { data: o } = await admin.auth.admin.createUser({
    email: `evstat-owner-${TS}@test.local`,
    password: "EvStatTest123!",
    email_confirm: true,
  });
  ownerId = o.user!.id;

  storeCode = "EVS1" + TS.toString().slice(-6);
  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: storeCode, store_name: "이벤트상태테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  const { data: ev } = await admin
    .from("events")
    .insert({ store_link_id: storeLinkId, type: "onsite", title: "상태테스트이벤트", status: "active", reward_benefit: "혜택" })
    .select("id")
    .single();
  eventId = (ev as { id: string }).id;

  const joined = await createParticipation(admin, { storeCode, channel: "phone", identifier, consents: FULL_CONSENTS });
  if ("error" in joined) throw new Error(`setup failed: ${joined.error}`);

  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("store_link_id", storeLinkId)
    .eq("phone_hash", hashPII(identifier, "phone"))
    .single();
  customerId = (customer as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  if (couponId) await admin.from("coupons").delete().eq("id", couponId);
  await admin.from("event_participations").delete().eq("customer_id", customerId);
  await admin.from("consents").delete().eq("customer_id", customerId);
  await admin.from("customers").delete().eq("id", customerId);
  await admin.from("events").delete().eq("id", eventId);
  await admin.from("store_links").delete().eq("id", storeLinkId);
  await admin.auth.admin.deleteUser(ownerId);
});

describe("status_flow", () => {
  it("returns 'pending' right after join", async () => {
    const admin = adminClient();
    const result = await getParticipationStatus(admin, storeCode, { channel: "phone", identifier });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.participation?.status).toBe("pending");
  });

  it("returns 'approved' + coupon after staff approval (seeded)", async () => {
    const admin = adminClient();

    const { data: coupon } = await admin
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: customerId,
        kind: "custom",
        code: `EVS-${TS}`,
        benefit: "이벤트 혜택",
        status: "issued",
        event_id: eventId,
      })
      .select("id")
      .single();
    couponId = (coupon as { id: string }).id;

    await admin
      .from("event_participations")
      .update({ status: "approved", approved_at: new Date().toISOString(), coupon_id: couponId })
      .eq("event_id", eventId)
      .eq("customer_id", customerId);

    const result = await getParticipationStatus(admin, storeCode, { channel: "phone", identifier });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.participation?.status).toBe("approved");
    expect(result.participation?.coupon?.code).toBe(`EVS-${TS}`);
    expect(result.participation?.coupon?.benefit).toBe("이벤트 혜택");
  });
});

describe("upcoming_banner", () => {
  it("returns only preannounce + scheduled + future events for the store", async () => {
    const admin = adminClient();
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    const past = new Date(Date.now() - 7 * 86400000).toISOString();

    const { data: futurePre } = await admin
      .from("events")
      .insert({ store_link_id: storeLinkId, type: "preannounce", title: "다가오는예고", status: "scheduled", start_at: future, reward_benefit: "혜택" })
      .select("id")
      .single();
    const { data: pastPre } = await admin
      .from("events")
      .insert({ store_link_id: storeLinkId, type: "preannounce", title: "지난예고", status: "scheduled", start_at: past, reward_benefit: "혜택" })
      .select("id")
      .single();
    const { data: activePre } = await admin
      .from("events")
      .insert({ store_link_id: storeLinkId, type: "preannounce", title: "이미시작한예고", status: "active", start_at: past, reward_benefit: "혜택" })
      .select("id")
      .single();
    const { data: onsiteFuture } = await admin
      .from("events")
      .insert({ store_link_id: storeLinkId, type: "onsite", title: "현장이벤트무관", status: "scheduled", start_at: future, reward_benefit: "혜택" })
      .select("id")
      .single();

    const ids = [futurePre, pastPre, activePre, onsiteFuture].map((r) => (r as { id: string }).id);

    try {
      const upcoming = await listUpcomingPreannounce(admin, storeLinkId);
      const titles = upcoming.map((e) => e.title);
      expect(titles).toContain("다가오는예고");
      expect(titles).not.toContain("지난예고");
      expect(titles).not.toContain("이미시작한예고");
      expect(titles).not.toContain("현장이벤트무관");
    } finally {
      await admin.from("events").delete().in("id", ids);
    }
  });
});
