// Solapi webhook callback — updates messages.status + callback_at.
// Verifies HMAC-SHA256 signature from SOLAPI_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";

function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.SOLAPI_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-solapi-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let events: Array<{ messageId?: string; status?: string }>;
  try {
    events = JSON.parse(rawBody);
    if (!Array.isArray(events)) events = [events];
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' } }
  );

  for (const ev of events) {
    if (!ev.messageId) continue;
    const status = ev.status === "COMPLETE" ? "sent" : "failed";

    await db
      .from("messages")
      .update({ status, callback_at: new Date().toISOString() })
      .eq("provider_msg_id", ev.messageId);
  }

  return NextResponse.json({ ok: true });
}
