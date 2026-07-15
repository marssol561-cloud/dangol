// Verifies fallback order: alimtalk (unconnected) → email → sms
// Verifies that messages rows are inserted with the channel actually used.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { encryptPII } from "@/lib/crypto";
import { sendToSegment } from "@/lib/messaging";

// MOCK must be enabled
process.env.SOLAPI_MOCK = "true";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupFallbackEnv() {
  const admin = adminClient();
  const email = `fb_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Test1234!", email_confirm: true,
    user_metadata: { name: "폴백테스트", terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
  });
  await new Promise((r) => setTimeout(r, 800));
  const userId = u.user!.id;
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({ owner_id: userId, master_store_id: crypto.randomUUID(), store_code: code, store_name: "폴백테스트매장", address: "서울시" })
    .select("id").single();
  const storeLinkId = (link as { id: string }).id;

  // Customer with phone + email
  const { data: c } = await admin.from("customers").insert({
    store_link_id: storeLinkId,
    grade: "normal",
    phone_enc: encryptPII("01012345678"),
    email_enc: encryptPII("test@example.com"),
    last_visit_at: new Date().toISOString(),
    unsub_token: crypto.randomUUID(),
  }).select("id").single();
  const customerId = (c as { id: string }).id;

  // Give ad_sms + ad_email consent
  await admin.from("consents").insert([
    { customer_id: customerId, store_link_id: storeLinkId, type: "ad_sms", agreed: true, agreed_at: new Date().toISOString() },
    { customer_id: customerId, store_link_id: storeLinkId, type: "ad_email", agreed: true, agreed_at: new Date().toISOString() },
  ]);

  // send_channels: connected=true, NO kakao_channel_id (alimtalk unavailable)
  const encKey = encryptPII("fake_solapi_key_for_testing");
  await admin.from("send_channels").insert({
    store_link_id: storeLinkId,
    provider: "solapi",
    kakao_channel_id: null,
    sender_number: "01000000000",
    api_key_enc: encKey,
    setup_step: 4,
    connected: true,
  });

  return { admin, userId, storeLinkId, customerId };
}

let ctx: Awaited<ReturnType<typeof setupFallbackEnv>>;

describe("sendToSegment fallback chain", () => {
  beforeAll(async () => {
    ctx = await setupFallbackEnv();
  });

  it("alimtalk unconnected → uses email (first available channel)", async () => {
    const result = await sendToSegment(ctx.storeLinkId, "grade", "returning_reminder");
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const admin = adminClient();
    const { data: msgs } = await admin
      .from("messages")
      .select("channel, status")
      .eq("store_link_id", ctx.storeLinkId)
      .eq("customer_id", ctx.customerId);

    const sentMsgs = (msgs ?? []) as { channel: string; status: string }[];
    expect(sentMsgs.length).toBeGreaterThanOrEqual(1);

    // alimtalk should NOT appear (no kakao_channel_id)
    const channels = sentMsgs.map((m) => m.channel);
    expect(channels).not.toContain("alimtalk");

    // email should be the first used
    expect(channels).toContain("email");
  });

  it("records the channel actually used in messages row", async () => {
    const admin = adminClient();
    const { data: msgs } = await admin
      .from("messages")
      .select("channel, status, provider_msg_id")
      .eq("store_link_id", ctx.storeLinkId)
      .eq("status", "sent");

    const rows = (msgs ?? []) as { channel: string; status: string; provider_msg_id: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // MOCK mode: provider_msg_id starts with mock_
    expect(rows[0].provider_msg_id).toMatch(/^mock_/);
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userId, storeLinkId } = ctx;
    await admin.from("messages").delete().eq("store_link_id", storeLinkId);
    await admin.from("send_channels").delete().eq("store_link_id", storeLinkId);
    await admin.from("consents").delete().eq("store_link_id", storeLinkId);
    await admin.from("customers").delete().eq("store_link_id", storeLinkId);
    await admin.from("store_links").delete().eq("id", storeLinkId);
    await admin.auth.admin.deleteUser(userId);
  });
});
