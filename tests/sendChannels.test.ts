// Tests send_channels: encrypted key storage, setup_step, connected transitions.
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { encryptPII, decryptPII } from "@/lib/crypto";

process.env.SOLAPI_MOCK = "true";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `sc_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Test1234!", email_confirm: true,
    user_metadata: { name: "채널테스트", terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
  });
  await new Promise((r) => setTimeout(r, 800));
  const userId = u.user!.id;
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({ owner_id: userId, master_store_id: crypto.randomUUID(), store_code: code, store_name: "채널테스트매장", address: "서울시" })
    .select("id").single();

  return { admin, userId, storeLinkId: (link as { id: string }).id };
}

let ctx: Awaited<ReturnType<typeof setupOwnerAndLink>>;

describe("send_channels — encrypted key storage", () => {
  it("setup", async () => {
    ctx = await setupOwnerAndLink();
    expect(ctx.storeLinkId).toBeTruthy();
  });

  it("stores API key encrypted (not plaintext)", async () => {
    const plainKey = "real_solapi_api_secret_key";
    const encKey = encryptPII(plainKey);

    await ctx.admin.from("send_channels").insert({
      store_link_id: ctx.storeLinkId,
      provider: "solapi",
      api_key_enc: encKey,
      setup_step: 3,
      connected: false,
    });

    const { data } = await ctx.admin
      .from("send_channels")
      .select("api_key_enc")
      .eq("store_link_id", ctx.storeLinkId)
      .single();

    const stored = (data as { api_key_enc: string }).api_key_enc;
    // Stored value must NOT equal plaintext
    expect(stored).not.toBe(plainKey);
    // Must decrypt back to original
    expect(decryptPII(stored)).toBe(plainKey);
  });

  it("setup_step progresses correctly", async () => {
    await ctx.admin
      .from("send_channels")
      .update({ setup_step: 4, connected: true })
      .eq("store_link_id", ctx.storeLinkId);

    const { data } = await ctx.admin
      .from("send_channels")
      .select("setup_step, connected")
      .eq("store_link_id", ctx.storeLinkId)
      .single();

    const row = data as { setup_step: number; connected: boolean };
    expect(row.setup_step).toBe(4);
    expect(row.connected).toBe(true);
  });

  it("setup_step must be between 0 and 4 (constraint)", async () => {
    const { error } = await ctx.admin
      .from("send_channels")
      .update({ setup_step: 5 })
      .eq("store_link_id", ctx.storeLinkId);

    expect(error).not.toBeNull();
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userId, storeLinkId } = ctx;
    await admin.from("send_channels").delete().eq("store_link_id", storeLinkId);
    await admin.from("store_links").delete().eq("id", storeLinkId);
    await admin.auth.admin.deleteUser(userId);
  });
});
