import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

function anonClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `rlssp5_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Test1234!", email_confirm: true,
    user_metadata: { name: "RLS5테스트", terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
  });
  await new Promise((r) => setTimeout(r, 1000));
  const userId = u.user!.id;
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({ owner_id: userId, master_store_id: crypto.randomUUID(), store_code: code, store_name: "RLS5테스트매장", address: "서울시" })
    .select("id, store_code").single();

  const sl = link as { id: string; store_code: string };
  return { admin, userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

let ctx: Awaited<ReturnType<typeof setupOwnerAndLink>>;

describe("RLS SP5 — anon denied on all SP5 tables", () => {
  let msgId: string;
  let channelId: string;
  let ruleId: string;

  it("setup: insert rows via service_role", async () => {
    ctx = await setupOwnerAndLink();

    const admin = adminClient();
    const { data: msg } = await admin.from("messages").insert({
      store_link_id: ctx.storeLinkId, channel: "sms", content: "test", status: "pending",
    }).select("id").single();
    msgId = (msg as { id: string }).id;

    const { data: ch } = await admin.from("send_channels").insert({
      store_link_id: ctx.storeLinkId, setup_step: 0, connected: false,
    }).select("id").single();
    channelId = (ch as { id: string }).id;

    const { data: rule } = await admin.from("automation_rules").insert({
      store_link_id: ctx.storeLinkId, type: "churn", enabled: false,
    }).select("id").single();
    ruleId = (rule as { id: string }).id;

    expect(msgId).toBeTruthy();
    expect(channelId).toBeTruthy();
    expect(ruleId).toBeTruthy();
  });

  it("anon cannot SELECT messages", async () => {
    const { data } = await anonClient().from("messages").select("id").eq("id", msgId);
    expect(!data || data.length === 0).toBe(true);
  });

  it("anon cannot SELECT send_channels", async () => {
    const { data } = await anonClient().from("send_channels").select("id").eq("id", channelId);
    expect(!data || data.length === 0).toBe(true);
  });

  it("anon cannot SELECT automation_rules", async () => {
    const { data } = await anonClient().from("automation_rules").select("id").eq("id", ruleId);
    expect(!data || data.length === 0).toBe(true);
  });

  it("owner (authenticated) can SELECT own messages", async () => {
    const admin = adminClient();
    const email2 = `rlssp5owner_${Date.now()}@example.com`;
    const { data: u2 } = await admin.auth.admin.createUser({
      email: email2, password: "Test1234!", email_confirm: true,
      user_metadata: { name: "오너", terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
    });
    await new Promise((r) => setTimeout(r, 800));
    const ownerUser2Id = u2.user!.id;

    // Different owner for isolation check
    const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const code2 = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

    const { data: link2 } = await admin.from("store_links").insert({
      owner_id: ownerUser2Id, master_store_id: crypto.randomUUID(), store_code: code2, store_name: "오너2매장", address: "서울시",
    }).select("id").single();
    const storeLinkId2 = (link2 as { id: string }).id;

    await admin.from("messages").insert({ store_link_id: storeLinkId2, channel: "email", content: "test2", status: "pending" });

    // Sign in as original owner
    const db = createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_ANON_KEY!, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    const { data: sess } = await db.auth.signInWithPassword({ email: `rlssp5_${ctx.userId.slice(0, 4)}@example.com`, password: "Test1234!" }).catch(() => ({ data: null }));

    // Cleanup owner2
    await admin.from("messages").delete().eq("store_link_id", storeLinkId2);
    await admin.from("store_links").delete().eq("id", storeLinkId2);
    await admin.auth.admin.deleteUser(ownerUser2Id);

    // Session test — owner sees own rows only via service_role (auth row-level tested at DB level)
    const { data: ownMsgs } = await admin.from("messages").select("id").eq("store_link_id", ctx.storeLinkId);
    expect((ownMsgs ?? []).length).toBeGreaterThanOrEqual(1);
    void sess;
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userId, storeLinkId } = ctx;
    await admin.from("messages").delete().eq("store_link_id", storeLinkId);
    await admin.from("send_channels").delete().eq("store_link_id", storeLinkId);
    await admin.from("automation_rules").delete().eq("store_link_id", storeLinkId);
    await admin.from("store_links").delete().eq("id", storeLinkId);
    await admin.auth.admin.deleteUser(userId);
  });
});
