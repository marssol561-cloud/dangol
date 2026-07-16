import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getCustomerEventHistory } from "@/lib/events";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const TS = Date.now();
let ownerAId: string;
let storeA: string;
let storeB: string;
let customerId: string;
let event1Id: string;
let event2Id: string;
let coupon1Id: string;
const createdParticipationIds: string[] = [];

beforeAll(async () => {
  const admin = adminClient();

  const { data: oa } = await admin.auth.admin.createUser({ email: `evhist-a-${TS}@test.local`, password: "EvHistTest123!", email_confirm: true });
  ownerAId = oa.user!.id;

  const { data: sa } = await admin
    .from("store_links")
    .insert({ store_code: "EVHA" + TS.toString().slice(-5), store_name: "이력테스트매장A", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id").single();
  storeA = (sa as { id: string }).id;

  const { data: sb } = await admin
    .from("store_links")
    .insert({ store_code: "EVHB" + TS.toString().slice(-5), store_name: "이력테스트매장B", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id").single();
  storeB = (sb as { id: string }).id;

  const { data: c } = await admin
    .from("customers")
    .insert({ store_link_id: storeA, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID() })
    .select("id").single();
  customerId = (c as { id: string }).id;

  const { data: e1 } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "아메리카노 이벤트", status: "active", reward_benefit: "아메리카노 1잔" })
    .select("id").single();
  event1Id = (e1 as { id: string }).id;

  const { data: e2 } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "디저트 이벤트", status: "active", reward_benefit: "디저트 1개" })
    .select("id").single();
  event2Id = (e2 as { id: string }).id;

  const { data: coupon } = await admin
    .from("coupons")
    .insert({ store_link_id: storeA, customer_id: customerId, kind: "custom", event_id: event1Id, code: `EVH-${TS}-1`, benefit: "아메리카노 1잔", status: "used" })
    .select("id").single();
  coupon1Id = (coupon as { id: string }).id;

  // Older participation (approved, coupon used) — event1
  const { data: p1 } = await admin
    .from("event_participations")
    .insert({
      event_id: event1Id, customer_id: customerId, store_link_id: storeA, status: "approved",
      coupon_id: coupon1Id, created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    .select("id").single();
  createdParticipationIds.push((p1 as { id: string }).id);

  // Newer participation (pending, no coupon) — event2
  const { data: p2 } = await admin
    .from("event_participations")
    .insert({ event_id: event2Id, customer_id: customerId, store_link_id: storeA, status: "pending", created_at: new Date().toISOString() })
    .select("id").single();
  createdParticipationIds.push((p2 as { id: string }).id);
});

afterAll(async () => {
  const admin = adminClient();
  if (createdParticipationIds.length) await admin.from("event_participations").delete().in("id", createdParticipationIds);
  await admin.from("coupons").delete().eq("id", coupon1Id);
  await admin.from("events").delete().in("id", [event1Id, event2Id]);
  await admin.from("customers").delete().eq("id", customerId);
  await admin.from("store_links").delete().in("id", [storeA, storeB]);
  await admin.auth.admin.deleteUser(ownerAId);
});

describe("getCustomerEventHistory", () => {
  it("returns this customer's participations, newest first, with reward + exchange status", async () => {
    const admin = adminClient();
    const history = await getCustomerEventHistory(admin, customerId, storeA);
    expect(history).toHaveLength(2);

    // newest first: event2 (pending) then event1 (approved+used)
    expect(history[0].eventTitle).toBe("디저트 이벤트");
    expect(history[0].status).toBe("pending");
    expect(history[0].rewardBenefit).toBe("디저트 1개");
    expect(history[0].exchange).toBeNull();

    expect(history[1].eventTitle).toBe("아메리카노 이벤트");
    expect(history[1].status).toBe("approved");
    expect(history[1].rewardBenefit).toBe("아메리카노 1잔");
    expect(history[1].exchange).toBe("used");
  });

  it("returns empty for a customer belonging to a different store (cross-store)", async () => {
    const admin = adminClient();
    const history = await getCustomerEventHistory(admin, customerId, storeB);
    expect(history).toHaveLength(0);
  });
});
