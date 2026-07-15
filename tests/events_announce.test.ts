import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createEvent, previewAnnounce, sendAnnounce, PREANNOUNCE_UNIT_PRICE_KRW } from "@/lib/events";
import { encryptPII } from "@/lib/crypto";

process.env.SOLAPI_MOCK = "true";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const TS = Date.now();
let ownerId: string;
let storeLinkId: string;
let onsiteEventId: string;
let preannounceEventId: string;
const customerIds: string[] = [];

beforeAll(async () => {
  const admin = adminClient();
  const { data: o } = await admin.auth.admin.createUser({ email: `evann-${TS}@test.local`, password: "EvAnnTest123!", email_confirm: true });
  ownerId = o.user!.id;

  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: "EVAN" + TS.toString().slice(-5), store_name: "예고발송테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  const onsite = await createEvent(admin, storeLinkId, ownerId, { type: "onsite", title: "현장이벤트", reward_benefit: "혜택" });
  if ("error" in onsite) throw new Error("setup failed: onsite event");
  onsiteEventId = onsite.event.id;

  const pre = await createEvent(admin, storeLinkId, ownerId, { type: "preannounce", title: "예고이벤트", reward_benefit: "혜택" });
  if ("error" in pre) throw new Error("setup failed: preannounce event");
  preannounceEventId = pre.event.id;

  for (let i = 0; i < 2; i++) {
    const { data: c } = await admin
      .from("customers")
      .insert({
        store_link_id: storeLinkId,
        grade: "normal",
        phone_enc: encryptPII(`0101234000${i}`),
        last_visit_at: new Date().toISOString(),
        unsub_token: crypto.randomUUID(),
      })
      .select("id")
      .single();
    const cid = (c as { id: string }).id;
    customerIds.push(cid);
    await admin.from("consents").insert({ customer_id: cid, store_link_id: storeLinkId, type: "ad_sms", agreed: true, agreed_at: new Date().toISOString() });
  }

  await admin.from("send_channels").insert({
    store_link_id: storeLinkId,
    provider: "solapi",
    kakao_channel_id: null,
    sender_number: "01000000000",
    api_key_enc: encryptPII("fake_key_events_announce"),
    setup_step: 4,
    connected: true,
  });
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("messages").delete().eq("store_link_id", storeLinkId);
  await admin.from("send_channels").delete().eq("store_link_id", storeLinkId);
  await admin.from("consents").delete().in("customer_id", customerIds);
  await admin.from("customers").delete().in("id", customerIds);
  await admin.from("events").delete().in("id", [onsiteEventId, preannounceEventId]);
  await admin.from("store_links").delete().eq("id", storeLinkId);
  await admin.auth.admin.deleteUser(ownerId);
});

describe("previewAnnounce", () => {
  it("preannounce event → returns exact count + estimatedCost + costIsEstimate, no send", async () => {
    const admin = adminClient();
    const before = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId)).count ?? 0;

    const result = await previewAnnounce(admin, preannounceEventId, storeLinkId, "grade");
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.count).toBe(2);
    expect(result.costIsEstimate).toBe(true);
    expect(result.estimatedCost).toBe(result.count * PREANNOUNCE_UNIT_PRICE_KRW);

    const after = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId)).count ?? 0;
    expect(after).toBe(before);
  });

  it("onsite event (onsite_no_announce) → not_preannounce error", async () => {
    const admin = adminClient();
    const result = await previewAnnounce(admin, onsiteEventId, storeLinkId, "grade");
    expect("error" in result && result.error).toBe("not_preannounce");
  });
});

describe("sendAnnounce", () => {
  it("daytime → invokes sendToSegment, messages inserted", async () => {
    const admin = adminClient();
    vi.useFakeTimers();
    try {
      const daytime = new Date();
      daytime.setUTCHours(3, 0, 0, 0); // 12:00 KST — not night-blocked
      vi.setSystemTime(daytime);

      const result = await sendAnnounce(admin, preannounceEventId, storeLinkId, "grade", "returning_reminder");
      if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
      expect(result.sent + result.failed).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }

    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId);
    expect(count ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("night time → 422-equivalent night_blocked, no send", async () => {
    const admin = adminClient();
    const before = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId)).count ?? 0;

    vi.useFakeTimers();
    let result;
    try {
      const night = new Date();
      night.setUTCHours(13, 0, 0, 0); // 22:00 KST — night-blocked
      vi.setSystemTime(night);
      result = await sendAnnounce(admin, preannounceEventId, storeLinkId, "grade", "stamp_reward");
    } finally {
      vi.useRealTimers();
    }

    expect("error" in result! && result.error).toBe("night_blocked");
    const after = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId)).count ?? 0;
    expect(after).toBe(before);
  });

  it("onsite event → not_preannounce, no send attempted", async () => {
    const admin = adminClient();
    const before = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId)).count ?? 0;

    const result = await sendAnnounce(admin, onsiteEventId, storeLinkId, "grade", "returning_reminder");
    expect("error" in result && result.error).toBe("not_preannounce");

    const after = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("store_link_id", storeLinkId)).count ?? 0;
    expect(after).toBe(before);
  });
});
