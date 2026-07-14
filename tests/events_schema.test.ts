import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `evschema_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "이벤트스키마테스트",
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
      store_name: "이벤트스키마테스트매장",
      address: "서울시",
    })
    .select("id, store_code")
    .single();

  const sl = link as { id: string; store_code: string };
  return { userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

async function createCustomer(storeLinkId: string) {
  const admin = adminClient();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: `hash_evschema_${suffix}`,
      phone_enc: "enc",
      grade: "normal",
      visit_count: 0,
      browser_token: `bt_evschema_${suffix}`,
      unsub_token: `unsub_evschema_${suffix}`,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("createCustomer failed");
  return (data as { id: string }).id;
}

async function createEvent(storeLinkId: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("events")
    .insert({
      store_link_id: storeLinkId,
      type: "onsite",
      title: "스키마테스트이벤트",
      status: "active",
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

describe("events schema — 010 migration", () => {
  let ownerUserId: string;

  afterEach(async () => {
    if (ownerUserId) await adminClient().auth.admin.deleteUser(ownerUserId);
    ownerUserId = "";
  });

  it("schema_version is 010", async () => {
    const admin = adminClient();
    const { data } = await admin.from("app_meta").select("value").eq("key", "schema_version").single();
    expect((data as { value: string }).value).toBe("010");
  });

  it("events / event_participations / customer_tags tables exist", async () => {
    const admin = adminClient();
    const { data: e, error: eErr } = await admin.from("events").select("id").limit(0);
    const { data: p, error: pErr } = await admin.from("event_participations").select("id").limit(0);
    const { data: t, error: tErr } = await admin.from("customer_tags").select("id").limit(0);
    expect(eErr).toBeNull();
    expect(pErr).toBeNull();
    expect(tErr).toBeNull();
    expect(Array.isArray(e)).toBe(true);
    expect(Array.isArray(p)).toBe(true);
    expect(Array.isArray(t)).toBe(true);
  });

  it("coupons has event_id column", async () => {
    const admin = adminClient();
    const { data, error } = await admin.from("coupons").select("event_id").limit(0);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("uq_event_customer rejects duplicate (event_id, customer_id)", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const eventId = await createEvent(storeLinkId);
    const customerId = await createCustomer(storeLinkId);

    const first = await admin.from("event_participations").insert({
      event_id: eventId,
      customer_id: customerId,
      store_link_id: storeLinkId,
    });
    expect(first.error).toBeNull();

    const second = await admin.from("event_participations").insert({
      event_id: eventId,
      customer_id: customerId,
      store_link_id: storeLinkId,
    });
    expect(second.error).not.toBeNull();
  });

  it("coupons.event_id FK: valid event ok, random uuid rejected", async () => {
    const { userId, storeLinkId } = await setupOwnerAndLink();
    ownerUserId = userId;
    const admin = adminClient();

    const eventId = await createEvent(storeLinkId);
    const customerId = await createCustomer(storeLinkId);

    const ok = await admin
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: customerId,
        kind: "custom",
        code: `EVFK1_${Date.now()}`,
        benefit: "이벤트 쿠폰",
        event_id: eventId,
      });
    expect(ok.error).toBeNull();

    const bad = await admin
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: customerId,
        kind: "custom",
        code: `EVFK2_${Date.now()}`,
        benefit: "이벤트 쿠폰",
        event_id: crypto.randomUUID(),
      });
    expect(bad.error).not.toBeNull();
  });
});
