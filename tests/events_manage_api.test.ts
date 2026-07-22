import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  deriveStatus,
  createEvent,
  listStoreEvents,
  getEventDetail,
} from "@/lib/events";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}

const TS = Date.now();
let ownerId: string;
let storeLinkId: string;
let storeLinkId2: string;
const createdEventIds: string[] = [];

beforeAll(async () => {
  const admin = adminClient();

  const { data: o1 } = await admin.auth.admin.createUser({
    email: `evmgmt-owner-${TS}@test.local`,
    password: "EvMgmtTest123!",
    email_confirm: true,
  });
  ownerId = o1.user!.id;

  const { data: sl1 } = await admin
    .from("store_links")
    .insert({ store_code: "EVM1" + TS.toString().slice(-5), store_name: "이벤트관리테스트1", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl1 as { id: string }).id;

  const { data: sl2 } = await admin
    .from("store_links")
    .insert({ store_code: "EVM2" + TS.toString().slice(-5), store_name: "이벤트관리테스트2", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId2 = (sl2 as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  if (createdEventIds.length) await admin.from("events").delete().in("id", createdEventIds);
  await admin.from("store_links").delete().in("id", [storeLinkId, storeLinkId2]);
  await admin.auth.admin.deleteUser(ownerId);
});

describe("deriveStatus", () => {
  const now = new Date("2026-07-15T00:00:00Z");

  it("future start_at → scheduled", () => {
    expect(deriveStatus({ status: "scheduled", start_at: "2026-08-01T00:00:00Z", end_at: null, issue_cap: null }, 0, now)).toBe("scheduled");
  });

  it("issue_cap reached → closed", () => {
    expect(deriveStatus({ status: "active", start_at: null, end_at: null, issue_cap: 5 }, 5, now)).toBe("closed");
  });

  it("end_at passed → closed", () => {
    expect(deriveStatus({ status: "active", start_at: null, end_at: "2026-07-01T00:00:00Z", issue_cap: null }, 0, now)).toBe("closed");
  });

  it("no time/cap constraint hit → active", () => {
    expect(
      deriveStatus({ status: "scheduled", start_at: "2026-07-01T00:00:00Z", end_at: "2026-08-01T00:00:00Z", issue_cap: 10 }, 3, now)
    ).toBe("active");
  });

  it("stored status ended → preserved regardless of time/cap", () => {
    expect(deriveStatus({ status: "ended", start_at: null, end_at: null, issue_cap: null }, 0, now)).toBe("ended");
  });
});

describe("createEvent — validation", () => {
  it("valid onsite input → row created with derived status + created_by", async () => {
    const admin = adminClient();
    const result = await createEvent(admin, storeLinkId, ownerId, {
      type: "onsite",
      title: "생일 이벤트",
      reward_benefit: "케이크 서비스",
    });
    if ("error" in result) throw new Error(`unexpected validation error: ${result.error}`);
    createdEventIds.push(result.event.id);

    expect(result.event.title).toBe("생일 이벤트");
    expect(result.event.created_by).toBe(ownerId);
    expect(result.event.status).toBe("active");
    expect(result.event.store_link_id).toBe(storeLinkId);
  });

  it("period_inverted → end_at before start_at", async () => {
    const admin = adminClient();
    const result = await createEvent(admin, storeLinkId, ownerId, {
      title: "기간역전",
      reward_benefit: "혜택",
      start_at: "2026-08-01T00:00:00Z",
      end_at: "2026-07-01T00:00:00Z",
    });
    expect("error" in result && result.error).toBe("period_inverted");
  });

  it("cap_zero → issue_cap <= 0", async () => {
    const admin = adminClient();
    const result = await createEvent(admin, storeLinkId, ownerId, {
      title: "한도0",
      reward_benefit: "혜택",
      issue_cap: 0,
    });
    expect("error" in result && result.error).toBe("cap_zero");
  });

  it("reward_missing → no reward_coupon_kind and no reward_benefit", async () => {
    const admin = adminClient();
    const result = await createEvent(admin, storeLinkId, ownerId, { title: "리워드없음" });
    expect("error" in result && result.error).toBe("reward_missing");
  });

  it("title_required → blank title", async () => {
    const admin = adminClient();
    const result = await createEvent(admin, storeLinkId, ownerId, { title: "  ", reward_benefit: "혜택" });
    expect("error" in result && result.error).toBe("title_required");
  });
});

describe("listStoreEvents — scoped to store", () => {
  it("does not include another store's events", async () => {
    const admin = adminClient();
    const r1 = await createEvent(admin, storeLinkId, ownerId, { title: "매장1행사", reward_benefit: "혜택" });
    const r2 = await createEvent(admin, storeLinkId2, ownerId, { title: "매장2행사", reward_benefit: "혜택" });
    if ("error" in r1 || "error" in r2) throw new Error("setup failed");
    createdEventIds.push(r1.event.id, r2.event.id);

    const list = await listStoreEvents(admin, storeLinkId);
    const ids = list.map((e) => e.id);
    expect(ids).toContain(r1.event.id);
    expect(ids).not.toContain(r2.event.id);
  });
});

describe("getEventDetail — counters", () => {
  it("computes participated/issued/exchanged/thirdPartyConsentRate correctly", async () => {
    const admin = adminClient();
    const created = await createEvent(admin, storeLinkId, ownerId, { title: "카운터테스트이벤트", reward_benefit: "혜택" });
    if ("error" in created) throw new Error("setup failed");
    createdEventIds.push(created.event.id);
    const eventId = created.event.id;

    const custIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data: c } = await admin
        .from("customers")
        .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID() })
        .select("id")
        .single();
      custIds.push((c as { id: string }).id);
    }

    const { data: coupon } = await admin
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: custIds[0],
        kind: "custom",
        code: `EVMGMT-${TS}-1`,
        benefit: "혜택",
        status: "used",
        event_id: eventId,
      })
      .select("id")
      .single();
    const couponId = (coupon as { id: string }).id;

    await admin.from("event_participations").insert([
      { event_id: eventId, customer_id: custIds[0], store_link_id: storeLinkId, status: "approved", approved_at: new Date().toISOString(), coupon_id: couponId },
      { event_id: eventId, customer_id: custIds[1], store_link_id: storeLinkId, status: "approved", approved_at: new Date().toISOString() },
      { event_id: eventId, customer_id: custIds[2], store_link_id: storeLinkId, status: "pending" },
    ]);

    await admin.from("consents").insert([
      { customer_id: custIds[0], store_link_id: storeLinkId, type: "thirdparty", agreed: true, agreed_at: new Date().toISOString() },
      { customer_id: custIds[1], store_link_id: storeLinkId, type: "thirdparty", agreed: true, agreed_at: new Date().toISOString() },
      { customer_id: custIds[2], store_link_id: storeLinkId, type: "thirdparty", agreed: false },
    ]);

    const detail = await getEventDetail(admin, eventId, storeLinkId);
    expect(detail).not.toBeNull();
    expect(detail!.counters.participated).toBe(3);
    expect(detail!.counters.issued).toBe(2);
    expect(detail!.counters.exchanged).toBe(1);
    expect(detail!.counters.thirdPartyConsentRate).toBeCloseTo(2 / 3, 5);
    expect(detail!.participants.length).toBe(3);

    await admin.from("consents").delete().in("customer_id", custIds);
    await admin.from("event_participations").delete().eq("event_id", eventId);
    await admin.from("coupons").delete().eq("id", couponId);
    await admin.from("customers").delete().in("id", custIds);
  });
});
