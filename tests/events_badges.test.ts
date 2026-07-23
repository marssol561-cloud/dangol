import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { DangolClient } from "@/lib/dangolDb";
import { getEventBadges } from "@/lib/events";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}

const TS = Date.now();
let ownerAId: string;
let ownerBId: string;
let storeA: string;
let storeB: string;
const createdEventIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdParticipationIds: string[] = [];

async function makeCustomer(admin: DangolClient, storeLinkId: string): Promise<string> {
  const { data } = await admin
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID() })
    .select("id")
    .single();
  const id = (data as { id: string }).id;
  createdCustomerIds.push(id);
  return id;
}

async function makeParticipation(
  admin: DangolClient,
  eventId: string,
  storeLinkId: string,
  customerId: string,
  createdAt: string
): Promise<string> {
  const { data } = await admin
    .from("event_participations")
    .insert({ event_id: eventId, customer_id: customerId, store_link_id: storeLinkId, status: "pending", created_at: createdAt })
    .select("id")
    .single();
  const id = (data as { id: string }).id;
  createdParticipationIds.push(id);
  return id;
}

beforeAll(async () => {
  const admin = adminClient();

  const { data: oa } = await admin.auth.admin.createUser({ email: `evbdg-a-${TS}@test.local`, password: "EvBdgTest123!", email_confirm: true });
  ownerAId = oa.user!.id;
  const { data: ob } = await admin.auth.admin.createUser({ email: `evbdg-b-${TS}@test.local`, password: "EvBdgTest123!", email_confirm: true });
  ownerBId = ob.user!.id;

  const { data: sa } = await admin
    .from("store_links")
    .insert({ store_code: "EVBA" + TS.toString().slice(-5), store_name: "배지테스트매장A", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeA = (sa as { id: string }).id;

  const { data: sb } = await admin
    .from("store_links")
    .insert({ store_code: "EVBB" + TS.toString().slice(-5), store_name: "배지테스트매장B", owner_id: ownerBId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeB = (sb as { id: string }).id;

  // storeA: 1 active, 1 scheduled (future start_at), 1 closed (past end_at)
  const { data: activeEv } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "활성이벤트", status: "active", reward_benefit: "혜택" })
    .select("id").single();
  const { data: scheduledEv } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "예정이벤트", status: "scheduled", reward_benefit: "혜택", start_at: new Date(Date.now() + 7 * 86400000).toISOString() })
    .select("id").single();
  const { data: closedEv } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "종료이벤트", status: "active", reward_benefit: "혜택", end_at: new Date(Date.now() - 86400000).toISOString() })
    .select("id").single();
  createdEventIds.push((activeEv as { id: string }).id, (scheduledEv as { id: string }).id, (closedEv as { id: string }).id);

  // storeB: 1 active event — must NOT count toward storeA's badge
  const { data: otherStoreEv } = await admin
    .from("events")
    .insert({ store_link_id: storeB, type: "onsite", title: "타매장이벤트", status: "active", reward_benefit: "혜택" })
    .select("id").single();
  createdEventIds.push((otherStoreEv as { id: string }).id);

  // storeA participations: 2 today, 1 two days ago (KST) — today count should be 2
  const c1 = await makeCustomer(admin, storeA);
  const c2 = await makeCustomer(admin, storeA);
  const c3 = await makeCustomer(admin, storeA);
  await makeParticipation(admin, (activeEv as { id: string }).id, storeA, c1, new Date().toISOString());
  await makeParticipation(admin, (activeEv as { id: string }).id, storeA, c2, new Date().toISOString());
  await makeParticipation(admin, (activeEv as { id: string }).id, storeA, c3, new Date(Date.now() - 2 * 86400000).toISOString());

  // storeB participation today — must NOT count toward storeA's badge
  const c4 = await makeCustomer(admin, storeB);
  await makeParticipation(admin, (otherStoreEv as { id: string }).id, storeB, c4, new Date().toISOString());
});

afterAll(async () => {
  const admin = adminClient();
  if (createdParticipationIds.length) await admin.from("event_participations").delete().in("id", createdParticipationIds);
  if (createdCustomerIds.length) await admin.from("customers").delete().in("id", createdCustomerIds);
  if (createdEventIds.length) await admin.from("events").delete().in("id", createdEventIds);
  await admin.from("store_links").delete().in("id", [storeA, storeB]);
  await admin.auth.admin.deleteUser(ownerAId);
  await admin.auth.admin.deleteUser(ownerBId);
});

describe("getEventBadges", () => {
  it("counts only derived-active events for this store", async () => {
    const admin = adminClient();
    const badges = await getEventBadges(admin, storeA);
    expect(badges.activeEventCount).toBe(1);
  });

  it("counts only today's participations for this store", async () => {
    const admin = adminClient();
    const badges = await getEventBadges(admin, storeA);
    expect(badges.todayParticipationCount).toBe(2);
  });

  it("is scoped to the store — another store's active events/participations don't leak in", async () => {
    const admin = adminClient();
    const badgesB = await getEventBadges(admin, storeB);
    expect(badgesB.activeEventCount).toBe(1);
    expect(badgesB.todayParticipationCount).toBe(1);
  });
});
