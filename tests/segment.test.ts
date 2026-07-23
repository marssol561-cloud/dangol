import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { resolveSegment } from "@/lib/segments";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function setupStoreWithCustomers() {
  const admin = adminClient();
  const email = `seg_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "세그테스트",
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  await new Promise((r) => setTimeout(r, 800));
  const userId = u.user!.id;
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({ owner_id: userId, master_store_id: crypto.randomUUID(), store_code: code, store_name: "세그테스트매장", address: "서울시" })
    .select("id")
    .single();

  const storeLinkId = (link as { id: string }).id;

  // VIP customer — recent visit
  const { data: vip } = await admin.from("customers").insert({
    store_link_id: storeLinkId, grade: "vip", visit_count: 15,
    last_visit_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    unsub_token: crypto.randomUUID(),
  }).select("id").single();

  // Regular customer
  const { data: regular } = await admin.from("customers").insert({
    store_link_id: storeLinkId, grade: "regular", visit_count: 5,
    last_visit_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    unsub_token: crypto.randomUUID(),
  }).select("id").single();

  // Churn customer — 70 days ago
  const { data: churn } = await admin.from("customers").insert({
    store_link_id: storeLinkId, grade: "normal", visit_count: 2,
    last_visit_at: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
    unsub_token: crypto.randomUUID(),
  }).select("id").single();

  return {
    admin, userId, storeLinkId,
    vipId: (vip as { id: string }).id,
    regularId: (regular as { id: string }).id,
    churnId: (churn as { id: string }).id,
  };
}

let ctx: Awaited<ReturnType<typeof setupStoreWithCustomers>>;

describe("resolveSegment", () => {
  it("setup", async () => {
    ctx = await setupStoreWithCustomers();
    expect(ctx.storeLinkId).toBeTruthy();
  });

  it("grade=vip returns only vip customers", async () => {
    const results = await resolveSegment({ storeLinkId: ctx.storeLinkId, type: "grade", grade: "vip" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(ctx.vipId);
    expect(ids).not.toContain(ctx.regularId);
    expect(ids).not.toContain(ctx.churnId);
  });

  it("grade=regular returns only regular customers", async () => {
    const results = await resolveSegment({ storeLinkId: ctx.storeLinkId, type: "grade", grade: "regular" });
    expect(results.map((r) => r.id)).toContain(ctx.regularId);
    expect(results.map((r) => r.id)).not.toContain(ctx.vipId);
  });

  it("churn segment includes customers not visited in > 60 days", async () => {
    const results = await resolveSegment({ storeLinkId: ctx.storeLinkId, type: "churn", churnDays: 60 });
    expect(results.map((r) => r.id)).toContain(ctx.churnId);
    expect(results.map((r) => r.id)).not.toContain(ctx.vipId);
    expect(results.map((r) => r.id)).not.toContain(ctx.regularId);
  });

  it("anniversary segment returns empty (birth date not collected)", async () => {
    const results = await resolveSegment({ storeLinkId: ctx.storeLinkId, type: "anniversary" });
    expect(results).toHaveLength(0);
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userId, storeLinkId } = ctx;
    await admin.from("customers").delete().eq("store_link_id", storeLinkId);
    await admin.from("store_links").delete().eq("id", storeLinkId);
    await admin.auth.admin.deleteUser(userId);
  });
});
