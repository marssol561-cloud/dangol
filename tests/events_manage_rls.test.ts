import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEventDetail, updateEvent, listStoreEvents } from "@/lib/events";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const TS = Date.now();
let ownerAId: string;
let ownerBId: string;
let storeA: string;
let storeB: string;
let eventAId: string;

beforeAll(async () => {
  const admin = adminClient();

  const { data: oa } = await admin.auth.admin.createUser({ email: `evrls2-a-${TS}@test.local`, password: "EvRls2Test123!", email_confirm: true });
  ownerAId = oa.user!.id;
  const { data: ob } = await admin.auth.admin.createUser({ email: `evrls2-b-${TS}@test.local`, password: "EvRls2Test123!", email_confirm: true });
  ownerBId = ob.user!.id;

  const { data: sa } = await admin
    .from("store_links")
    .insert({ store_code: "EVRA" + TS.toString().slice(-5), store_name: "이벤트RLS매장A", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeA = (sa as { id: string }).id;

  const { data: sb } = await admin
    .from("store_links")
    .insert({ store_code: "EVRB" + TS.toString().slice(-5), store_name: "이벤트RLS매장B", owner_id: ownerBId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeB = (sb as { id: string }).id;

  const { data: ea } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "매장A이벤트", status: "active", reward_benefit: "혜택" })
    .select("id")
    .single();
  eventAId = (ea as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("events").delete().eq("id", eventAId);
  await admin.from("store_links").delete().in("id", [storeA, storeB]);
  await admin.auth.admin.deleteUser(ownerAId);
  await admin.auth.admin.deleteUser(ownerBId);
});

describe("cross-store scope rejection (owner A cannot GET/PATCH owner B's event)", () => {
  it("getEventDetail rejects when storeLinkId does not match the event's own store", async () => {
    const admin = adminClient();
    const detail = await getEventDetail(admin, eventAId, storeB);
    expect(detail).toBeNull();
  });

  it("getEventDetail succeeds for the event's own store", async () => {
    const admin = adminClient();
    const detail = await getEventDetail(admin, eventAId, storeA);
    expect(detail).not.toBeNull();
    expect(detail!.event.id).toBe(eventAId);
  });

  it("updateEvent rejects cross-store update (route maps this to 404)", async () => {
    const admin = adminClient();
    const result = await updateEvent(admin, eventAId, storeB, { title: "해킹시도" });
    expect("notFound" in result).toBe(true);

    const { data } = await admin.from("events").select("title").eq("id", eventAId).single();
    expect((data as { title: string }).title).toBe("매장A이벤트");
  });

  it("updateEvent succeeds for the event's own store", async () => {
    const admin = adminClient();
    const result = await updateEvent(admin, eventAId, storeA, { title: "매장A이벤트-수정" });
    if (!("event" in result)) throw new Error("unexpected non-success result");
    expect(result.event.title).toBe("매장A이벤트-수정");
  });

  it("listStoreEvents for storeB does not include storeA's event", async () => {
    const admin = adminClient();
    const list = await listStoreEvents(admin, storeB);
    expect(list.map((e) => e.id)).not.toContain(eventAId);
  });
});
