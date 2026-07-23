// Tests webhook route: signature verification + message status update.
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { POST } from "@/app/api/webhook/solapi/route";
import { NextRequest } from "next/server";

const WEBHOOK_SECRET = "test_webhook_secret_sp5";
process.env.SOLAPI_WEBHOOK_SECRET = WEBHOOK_SECRET;

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function setupMessageRow() {
  const admin = adminClient();
  const email = `wh_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Test1234!", email_confirm: true,
    user_metadata: { name: "웹훅테스트", terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString(), marketing_consent: false },
  });
  await new Promise((r) => setTimeout(r, 800));
  const userId = u.user!.id;
  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({ owner_id: userId, master_store_id: crypto.randomUUID(), store_code: code, store_name: "웹훅테스트매장", address: "서울시" })
    .select("id").single();
  const storeLinkId = (link as { id: string }).id;

  const msgId = "solapi_" + Date.now();
  const { data: msg } = await admin.from("messages").insert({
    store_link_id: storeLinkId,
    channel: "sms",
    template_id: "coupon_issued",
    content: "test",
    status: "pending",
    provider_msg_id: msgId,
  }).select("id").single();

  return { admin, userId, storeLinkId, msgId, messageRowId: (msg as { id: string }).id };
}

function makeReq(body: unknown, secret: string) {
  const payload = JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return new NextRequest("http://localhost/api/webhook/solapi", {
    method: "POST",
    headers: { "content-type": "application/json", "x-solapi-signature": sig },
    body: payload,
  });
}

let ctx: Awaited<ReturnType<typeof setupMessageRow>>;

describe("webhook /api/webhook/solapi", () => {
  it("setup", async () => {
    ctx = await setupMessageRow();
    expect(ctx.msgId).toBeTruthy();
  });

  it("bad signature returns 401", async () => {
    const req = makeReq([{ messageId: ctx.msgId, status: "COMPLETE" }], "wrong_secret");
    const resp = await POST(req);
    expect(resp.status).toBe(401);
  });

  it("valid signature updates message status to sent", async () => {
    const req = makeReq([{ messageId: ctx.msgId, status: "COMPLETE" }], WEBHOOK_SECRET);
    const resp = await POST(req);
    expect(resp.status).toBe(200);

    const { data } = await adminClient()
      .from("messages")
      .select("status, callback_at")
      .eq("id", ctx.messageRowId)
      .single();

    const row = data as { status: string; callback_at: string | null };
    expect(row.status).toBe("sent");
    expect(row.callback_at).not.toBeNull();
  });

  it("valid signature with failed status updates to failed", async () => {
    // Insert another message row
    const admin = adminClient();
    const msgId2 = "solapi_fail_" + Date.now();
    const { data: msg2 } = await admin.from("messages").insert({
      store_link_id: ctx.storeLinkId,
      channel: "sms",
      content: "test2",
      status: "pending",
      provider_msg_id: msgId2,
    }).select("id").single();

    const req = makeReq([{ messageId: msgId2, status: "PENDING" }], WEBHOOK_SECRET);
    await POST(req);

    const { data } = await admin.from("messages").select("status").eq("id", (msg2 as { id: string }).id).single();
    expect((data as { status: string }).status).toBe("failed");
  });

  it("idempotent — second identical callback does not error", async () => {
    const req = makeReq([{ messageId: ctx.msgId, status: "COMPLETE" }], WEBHOOK_SECRET);
    const resp = await POST(req);
    expect(resp.status).toBe(200);
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userId, storeLinkId } = ctx;
    await admin.from("messages").delete().eq("store_link_id", storeLinkId);
    await admin.from("store_links").delete().eq("id", storeLinkId);
    await admin.auth.admin.deleteUser(userId);
  });
});
