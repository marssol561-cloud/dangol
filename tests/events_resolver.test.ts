import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { resolveStoreEvent } from "@/lib/events";
import { GET } from "@/app/api/r/[code]/store/route";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `evresolver_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "이벤트리졸버테스트",
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  await new Promise((r) => setTimeout(r, 1000));
  const userId = u.user!.id;

  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({
      owner_id: userId,
      master_store_id: crypto.randomUUID(),
      store_code: code,
      store_name: "이벤트리졸버테스트매장",
      address: "서울시",
    })
    .select("id, store_code")
    .single();

  const sl = link as { id: string; store_code: string };
  return { userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

async function createEvent(
  storeLinkId: string,
  overrides: Partial<{ type: "onsite" | "preannounce"; status: string; issue_cap: number | null }> = {}
) {
  const admin = adminClient();
  const { data } = await admin
    .from("events")
    .insert({
      store_link_id: storeLinkId,
      type: overrides.type ?? "onsite",
      title: "리졸버테스트이벤트",
      description: "설명",
      reward_benefit: "혜택",
      status: overrides.status ?? "active",
      issue_cap: overrides.issue_cap ?? null,
    })
    .select("*")
    .single();
  return data as { id: string };
}

async function createCustomer(storeLinkId: string) {
  const admin = adminClient();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: `hash_evresolver_${suffix}`,
      phone_enc: "enc",
      grade: "normal",
      visit_count: 0,
      browser_token: `bt_evresolver_${suffix}`,
      unsub_token: `unsub_evresolver_${suffix}`,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("createCustomer failed");
  return (data as { id: string }).id;
}

async function approveParticipation(eventId: string, customerId: string, storeLinkId: string) {
  const admin = adminClient();
  await admin.from("event_participations").insert({
    event_id: eventId,
    customer_id: customerId,
    store_link_id: storeLinkId,
    status: "approved",
    approved_at: new Date().toISOString(),
  });
}

describe("resolveStoreEvent — priority & availability", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
    ownerUserId = "";
  });

  it("onsite + preannounce both active → returns onsite", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    await createEvent(storeLinkId, { type: "preannounce" });
    const onsite = await createEvent(storeLinkId, { type: "onsite" });

    const result = await resolveStoreEvent(admin, storeLinkId);
    expect(result.state).toBe("active");
    expect(result.event?.id).toBe(onsite.id);
  });

  it("cap-exhausted only event → state closed", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const event = await createEvent(storeLinkId, { issue_cap: 1 });
    const customerId = await createCustomer(storeLinkId);
    await approveParticipation(event.id, customerId, storeLinkId);

    const result = await resolveStoreEvent(admin, storeLinkId);
    expect(result.state).toBe("closed");
    expect(result.event?.id).toBe(event.id);
  });

  it("no events → state none", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const result = await resolveStoreEvent(admin, storeLinkId);
    expect(result.state).toBe("none");
    expect(result.event).toBeNull();
  });
});

function callStoreRoute(code: string) {
  return GET(new Request(`http://localhost/api/r/${code}/store`) as never, {
    params: Promise.resolve({ code }),
  });
}

describe("GET /api/r/[code]/store — event branch", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
    ownerUserId = "";
  });

  it("active event → body has event{}", async () => {
    const { userId, storeLinkId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;
    await createEvent(storeLinkId, { type: "onsite" });

    const res = await callStoreRoute(storeCode);
    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.event.type).toBe("onsite");
    expect(body.eventClosed).toBeUndefined();
  });

  it("cap-exhausted → body.eventClosed === true", async () => {
    const { userId, storeLinkId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;
    const event = await createEvent(storeLinkId, { issue_cap: 1 });
    const customerId = await createCustomer(storeLinkId);
    await approveParticipation(event.id, customerId, storeLinkId);

    const res = await callStoreRoute(storeCode);
    const body = await res.json();
    expect(body.eventClosed).toBe(true);
    expect(body.event).toBeUndefined();
  });

  it("no event → body has neither field (prior shape unchanged)", async () => {
    const { userId, storeCode } = await setupOwnerAndLink();
    ownerUserId = userId;

    const res = await callStoreRoute(storeCode);
    const body = await res.json();
    expect(body.event).toBeUndefined();
    expect(body.eventClosed).toBeUndefined();
    expect(typeof body.store_name).toBe("string");
  });
});
