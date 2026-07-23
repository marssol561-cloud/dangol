import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { DangolClient } from "@/lib/dangolDb";
import { approveParticipation } from "@/lib/events";

function adminClient() {
  return createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}

const TS = Date.now();
let ownerAId: string;
let ownerBId: string;
let storeA: string;
let storeB: string;
let eventId: string;

const createdCustomerIds: string[] = [];
const createdParticipationIds: string[] = [];
const createdCouponIds: string[] = [];

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
  eventId_: string,
  storeLinkId: string,
  customerId: string,
  status: "pending" | "approved" | "expired" | "cancelled" = "pending"
): Promise<string> {
  const { data } = await admin
    .from("event_participations")
    .insert({ event_id: eventId_, customer_id: customerId, store_link_id: storeLinkId, status })
    .select("id")
    .single();
  const id = (data as { id: string }).id;
  createdParticipationIds.push(id);
  return id;
}

beforeAll(async () => {
  const admin = adminClient();

  const { data: oa } = await admin.auth.admin.createUser({ email: `evap-a-${TS}@test.local`, password: "EvApTest123!", email_confirm: true });
  ownerAId = oa.user!.id;
  const { data: ob } = await admin.auth.admin.createUser({ email: `evap-b-${TS}@test.local`, password: "EvApTest123!", email_confirm: true });
  ownerBId = ob.user!.id;

  const { data: sa } = await admin
    .from("store_links")
    .insert({ store_code: "EVAP" + TS.toString().slice(-5), store_name: "승인테스트매장A", owner_id: ownerAId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeA = (sa as { id: string }).id;

  const { data: sb } = await admin
    .from("store_links")
    .insert({ store_code: "EVAB" + TS.toString().slice(-5), store_name: "승인테스트매장B", owner_id: ownerBId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeB = (sb as { id: string }).id;

  const { data: ev } = await admin
    .from("events")
    .insert({
      store_link_id: storeA,
      type: "onsite",
      title: "승인테스트이벤트",
      status: "active",
      condition: "20대, 여성",
      reward_benefit: "아메리카노 1잔",
      coupon_valid_days: 7,
    })
    .select("id")
    .single();
  eventId = (ev as { id: string }).id;
});

afterAll(async () => {
  const admin = adminClient();
  if (createdCouponIds.length) await admin.from("coupons").delete().in("id", createdCouponIds);
  if (createdCustomerIds.length) await admin.from("customer_tags").delete().in("customer_id", createdCustomerIds);
  if (createdParticipationIds.length) await admin.from("event_participations").delete().in("id", createdParticipationIds);
  if (createdCustomerIds.length) await admin.from("customers").delete().in("id", createdCustomerIds);
  await admin.from("events").delete().eq("id", eventId);
  await admin.from("store_links").delete().in("id", [storeA, storeB]);
  await admin.auth.admin.deleteUser(ownerAId);
  await admin.auth.admin.deleteUser(ownerBId);
});

describe("approve_issues_and_tags", () => {
  it("pending → approve: audit fields set, coupon(event_id, expires_at) issued+linked, customer_tags created from condition", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventId, storeA, customerId);

    const before = Date.now();
    const result = await approveParticipation(admin, participationId, ownerAId, storeA);
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.coupon.benefit).toBe("아메리카노 1잔");
    expect(result.coupon.code).toBeTruthy();

    const { data: partRow } = await admin
      .from("event_participations")
      .select("status, approved_by, approved_at, coupon_id, tag")
      .eq("id", participationId)
      .single();
    const p = partRow as { status: string; approved_by: string; approved_at: string | null; coupon_id: string | null; tag: string | null };
    expect(p.status).toBe("approved");
    expect(p.approved_by).toBe(ownerAId);
    expect(p.approved_at).not.toBeNull();
    expect(p.coupon_id).toBeTruthy();
    expect(p.tag).toBe("20대, 여성");

    const { data: couponRow } = await admin
      .from("coupons")
      .select("id, event_id, expires_at, code, benefit")
      .eq("id", p.coupon_id!)
      .single();
    const c = couponRow as { id: string; event_id: string; expires_at: string; code: string; benefit: string };
    createdCouponIds.push(c.id);
    expect(c.event_id).toBe(eventId);
    expect(c.code).toBe(result.coupon.code);

    const expiresAt = new Date(c.expires_at).getTime();
    const expectedMs = before + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expectedMs)).toBeLessThan(60_000);

    const { data: tagRows } = await admin
      .from("customer_tags")
      .select("tag, source_event_id, created_by")
      .eq("customer_id", customerId)
      .order("tag");
    const tags = (tagRows ?? []) as { tag: string; source_event_id: string; created_by: string }[];
    expect(tags.map((t) => t.tag)).toEqual(["20대", "여성"]);
    for (const t of tags) {
      expect(t.source_event_id).toBe(eventId);
      expect(t.created_by).toBe(ownerAId);
    }
  });
});

describe("approve_idempotent", () => {
  it("approving an already-approved participation returns the existing coupon, no second issuance", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventId, storeA, customerId);

    const first = await approveParticipation(admin, participationId, ownerAId, storeA);
    if ("error" in first) throw new Error(`unexpected error: ${first.error}`);

    const { data: partRow } = await admin.from("event_participations").select("coupon_id").eq("id", participationId).single();
    const couponId = (partRow as { coupon_id: string }).coupon_id;
    createdCouponIds.push(couponId);

    const second = await approveParticipation(admin, participationId, ownerAId, storeA);
    if ("error" in second) throw new Error(`unexpected error: ${second.error}`);
    expect(second.coupon.code).toBe(first.coupon.code);
    expect(second.coupon.benefit).toBe(first.coupon.benefit);

    const { count: couponCount } = await admin
      .from("coupons")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    expect(couponCount ?? 0).toBe(1);
  });
});

describe("approve_rejects_nonpending", () => {
  it("approving a cancelled participation → not_pending (route maps to 409)", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventId, storeA, customerId, "cancelled");

    const result = await approveParticipation(admin, participationId, ownerAId, storeA);
    expect("error" in result && result.error).toBe("not_pending");
  });

  it("approving an expired participation → not_pending", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventId, storeA, customerId, "expired");

    const result = await approveParticipation(admin, participationId, ownerAId, storeA);
    expect("error" in result && result.error).toBe("not_pending");
  });
});

describe("no_coupon_for_pending", () => {
  it("a pending (unapproved) participation has no coupon issued", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventId, storeA, customerId);

    const { count } = await admin.from("coupons").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
    expect(count ?? 0).toBe(0);

    const { data: p } = await admin.from("event_participations").select("coupon_id").eq("id", participationId).single();
    expect((p as { coupon_id: string | null }).coupon_id).toBeNull();
  });
});

describe("auth_scope", () => {
  // Route-level 401 for non-owner/staff sessions mirrors the exact
  // `!ctx || (ctx.role !== "owner" && ctx.role !== "staff")` pattern already
  // used unmocked in app/api/events/route.ts (SP-E2) — next/headers-based
  // cookie auth can't be exercised under vitest's node environment (see
  // tests/setup.ts precedent), so it's verified by code review, not a test.
  it("staff of store B cannot approve store A's participation (cross-store → not_found, no state change)", async () => {
    const admin = adminClient();
    const customerId = await makeCustomer(admin, storeA);
    const participationId = await makeParticipation(admin, eventId, storeA, customerId);

    const result = await approveParticipation(admin, participationId, ownerBId, storeB);
    expect("error" in result && result.error).toBe("not_found");

    const { data: partRow } = await admin.from("event_participations").select("status, coupon_id").eq("id", participationId).single();
    const p = partRow as { status: string; coupon_id: string | null };
    expect(p.status).toBe("pending");
    expect(p.coupon_id).toBeNull();
  });
});
