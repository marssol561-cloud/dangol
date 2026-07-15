import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isNightBlocked, filterByConsent, dailyCapOk, isDuplicate } from "@/lib/sendGuard";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupBase() {
  const admin = adminClient();
  const email = `guard_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Test1234!", email_confirm: true,
    user_metadata: { name: "가드테스트", terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
  });
  await new Promise((r) => setTimeout(r, 800));
  const userId = u.user!.id;
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({ owner_id: userId, master_store_id: crypto.randomUUID(), store_code: code, store_name: "가드테스트매장", address: "서울시" })
    .select("id").single();
  const storeLinkId = (link as { id: string }).id;

  const { data: c1 } = await admin.from("customers").insert({ store_link_id: storeLinkId, grade: "normal", unsub_token: crypto.randomUUID() }).select("id").single();
  const { data: c2 } = await admin.from("customers").insert({ store_link_id: storeLinkId, grade: "normal", unsub_token: crypto.randomUUID() }).select("id").single();
  const cust1 = (c1 as { id: string }).id;
  const cust2 = (c2 as { id: string }).id;

  // c1 has ad_sms consent; c2 does not
  await admin.from("consents").insert({ customer_id: cust1, store_link_id: storeLinkId, type: "ad_sms", agreed: true, agreed_at: new Date().toISOString() });

  return { admin, userId, storeLinkId, cust1, cust2 };
}

let ctx: Awaited<ReturnType<typeof setupBase>>;

describe("sendGuard — isNightBlocked", () => {
  it("08:01 KST = not blocked", () => {
    // UTC 23:01 = KST 08:01
    const d = new Date("2026-06-22T23:01:00Z");
    expect(isNightBlocked(d)).toBe(false);
  });

  it("21:00 KST = blocked", () => {
    // UTC 12:00 = KST 21:00
    const d = new Date("2026-06-22T12:00:00Z");
    expect(isNightBlocked(d)).toBe(true);
  });

  it("03:00 KST = blocked", () => {
    // UTC 18:00 = KST 03:00
    const d = new Date("2026-06-22T18:00:00Z");
    expect(isNightBlocked(d)).toBe(true);
  });

  it("07:59 KST = blocked", () => {
    // UTC 22:59 = KST 07:59
    const d = new Date("2026-06-22T22:59:00Z");
    expect(isNightBlocked(d)).toBe(true);
  });
});

describe("sendGuard — filterByConsent + dailyCapOk + isDuplicate", () => {
  it("setup", async () => {
    ctx = await setupBase();
    expect(ctx.storeLinkId).toBeTruthy();
  });

  it("filterByConsent keeps only consented customers", async () => {
    const customers = [{ id: ctx.cust1 }, { id: ctx.cust2 }];
    const filtered = await filterByConsent(customers, "sms");
    expect(filtered.map((c) => c.id)).toContain(ctx.cust1);
    expect(filtered.map((c) => c.id)).not.toContain(ctx.cust2);
  });

  it("filterByConsent returns empty array for empty input", async () => {
    const result = await filterByConsent([], "sms");
    expect(result).toHaveLength(0);
  });

  it("dailyCapOk returns true for fresh store link", async () => {
    const ok = await dailyCapOk(ctx.storeLinkId);
    expect(ok).toBe(true);
  });

  it("isDuplicate returns false for new template", async () => {
    const dup = await isDuplicate(ctx.cust1, "coupon_issued", 24 * 60 * 60 * 1000);
    expect(dup).toBe(false);
  });

  it("isDuplicate returns true after inserting a messages row", async () => {
    await ctx.admin.from("messages").insert({
      store_link_id: ctx.storeLinkId,
      customer_id: ctx.cust1,
      channel: "sms",
      template_id: "stamp_reward",
      content: "test",
      status: "sent",
    });
    const dup = await isDuplicate(ctx.cust1, "stamp_reward", 24 * 60 * 60 * 1000);
    expect(dup).toBe(true);
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userId, storeLinkId } = ctx;
    await admin.from("messages").delete().eq("store_link_id", storeLinkId);
    await admin.from("consents").delete().eq("store_link_id", storeLinkId);
    await admin.from("customers").delete().eq("store_link_id", storeLinkId);
    await admin.from("store_links").delete().eq("id", storeLinkId);
    await admin.auth.admin.deleteUser(userId);
  });
});
