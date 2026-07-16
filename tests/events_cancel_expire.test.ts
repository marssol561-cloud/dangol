import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cancelParticipation, listPendingApprovals } from "@/lib/events";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const TS = Date.now();
let ownerAId: string;
let ownerBId: string;
let storeA: string;
let storeB: string;
let eventAId: string;
let eventBId: string;

const createdCustomerIds: string[] = [];
const createdParticipationIds: string[] = [];

async function makeCustomer(admin: SupabaseClient, storeLinkId: string): Promise<string> {
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
  admin: SupabaseClient,
  eventId: string,
  storeLinkId: string,
  customerId: string,
  status: "pending" | "approved" | "expired" | "cancelled" = "pending",
  createdAt?: string
): Promise<string> {
  const row: Record<string, unknown> = { event_id: eventId, customer_id: customerId, store_link_id: storeLinkId, status };
  if (createdAt) row.created_at = createdAt;
  const { data } = await admin.from("event_participations").insert(row).select("id").single();
  const id = (data as { id: string }).id;
  createdParticipationIds.push(id);
  return id;
}

beforeAll(async () => {
  const admin = adminClient();

  const { data: oa } = await admin.auth.admin.createUser({ email: `evcx-a-${TS}@test.local`, password: "EvCxTest123!", email_confirm: true });
  ownerAId = oa.user!.id;
  const { data: ob } = await admin.auth.admin.createUser({ email: `evcx-b-${TS}@test.local`, password: "EvCxTest123!", email_confirm: true });
  ownerBId = ob.user!.id;

  const { data: sa } = await admin
    .from("store_links")
    .insert({ store_code: "EVCA" + TS.toString().slice(-5), store_name: "취소테스트매장A", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeA = (sa as { id: string }).id;

  const { data: sb } = await admin
    .from("store_links")
    .insert({ store_code: "EVCB" + TS.toString().slice(-5), store_name: "취소테스트매장B", owner_id: ownerBId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeB = (sb as { id: string }).id;

  const { data: ea } = await admin
    .from("events")
    .insert({ store_link_id: storeA, type: "onsite", title: "취소테스트이벤트A", status: "active", condition: "단골", reward_benefit: "혜택" })
    .select("id")
    .single();
  eventAId = (ea as { id: string }).id;

  const { data: eb } = await admin
    .from("events")
    .insert({ store_link_id: storeB, type: "onsite", title: "취소테스트이벤트B", status: "active", reward_benefit: "혜택" })
    .select("id")
    .single();
  eventBId = (eb as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  if (createdCustomerIds.length) await admin.from("customer_tags").delete().in("customer_id", createdCustomerIds);
  if (createdParticipationIds.length) await admin.from("event_participations").delete().in("id", createdParticipationIds);
  if (createdCustomerIds.length) await admin.from("customers").delete().in("id", createdCustomerIds);
  await admin.from("events").delete().in("id", [eventAId, eventBId]);
  await admin.from("store_links").delete().in("id", [storeA, storeB]);
  await admin.auth.admin.deleteUser(ownerAId);
  await admin.auth.admin.deleteUser(ownerBId);
});

describe("cancel", () => {
  it("cancel pending → status='cancelled', no coupon, no tags", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventAId, storeA, customerId);

    const result = await cancelParticipation(admin, participationId, storeA);
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.status).toBe("cancelled");

    const { data: partRow } = await admin.from("event_participations").select("status, coupon_id").eq("id", participationId).single();
    const p = partRow as { status: string; coupon_id: string | null };
    expect(p.status).toBe("cancelled");
    expect(p.coupon_id).toBeNull();

    const { count: tagCount } = await admin.from("customer_tags").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
    expect(tagCount ?? 0).toBe(0);
    const { count: couponCount } = await admin.from("coupons").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
    expect(couponCount ?? 0).toBe(0);
  });

  it("cancelling a non-pending (approved) participation → not_pending", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventAId, storeA, customerId, "approved");

    const result = await cancelParticipation(admin, participationId, storeA);
    expect("error" in result && result.error).toBe("not_pending");
  });

  it("staff of store B cannot cancel store A's participation (cross-store → not_found)", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventAId, storeA, customerId);

    const result = await cancelParticipation(admin, participationId, storeB);
    expect("error" in result && result.error).toBe("not_found");

    const { data: partRow } = await admin.from("event_participations").select("status").eq("id", participationId).single();
    expect((partRow as { status: string }).status).toBe("pending");
  });
});

describe("pending_scope_today", () => {
  it("listPendingApprovals returns only this store's pending created today; excludes other store + yesterday's pending", async () => {
    const admin = adminClient();

    const customerToday = await makeCustomer(admin, storeA);
    const participationToday = await makeParticipation(admin, eventAId, storeA, customerToday);

    // 25h margin is always outside "today" (KST) regardless of what time-of-day "now" is.
    const customerYesterday = await makeCustomer(admin, storeA);
    const yesterdayIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const participationYesterday = await makeParticipation(admin, eventAId, storeA, customerYesterday, "pending", yesterdayIso);

    const customerOtherStore = await makeCustomer(admin, storeB);
    const participationOtherStore = await makeParticipation(admin, eventBId, storeB, customerOtherStore);

    const list = await listPendingApprovals(admin, storeA);
    const ids = list.map((item) => item.participationId);
    expect(ids).toContain(participationToday);
    expect(ids).not.toContain(participationYesterday);
    expect(ids).not.toContain(participationOtherStore);

    const todayItem = list.find((item) => item.participationId === participationToday);
    expect(todayItem).toBeTruthy();
    expect(todayItem!.eventTitle).toBe("취소테스트이벤트A");
    expect(todayItem!.condition).toBe("단골");
    expect(todayItem!.customerLabel).toBeTruthy();
  });
});
