// A9 — send_channels GET/PUT (owner). Encrypts Solapi API key before storing.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptPII, decryptPII } from "@/lib/crypto";

async function resolveOwner(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const db = createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_ANON_KEY!);
  const { data: { user } } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
  return user;
}

export async function GET(req: NextRequest) {
  const user = await resolveOwner(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeLinkId = req.nextUrl.searchParams.get("store_link_id");
  if (!storeLinkId) return NextResponse.json({ error: "store_link_id required" }, { status: 400 });

  const sdb = createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!);

  const { data: link } = await sdb
    .from("store_links")
    .select("id")
    .eq("id", storeLinkId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await sdb
    .from("send_channels")
    .select("id, provider, kakao_channel_id, sender_number, setup_step, connected")
    .eq("store_link_id", storeLinkId)
    .maybeSingle();

  // Never return api_key_enc — only existence indicator
  const hasKey = !!((data as { api_key_enc?: string } | null)?.api_key_enc);
  return NextResponse.json({ channel: data ? { ...data, has_api_key: hasKey } : null });
}

export async function PUT(req: NextRequest) {
  const user = await resolveOwner(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    store_link_id: string;
    kakao_channel_id?: string;
    sender_number?: string;
    api_key?: string;       // plaintext — encrypted before storage
    setup_step?: number;
    connected?: boolean;
  };

  const { store_link_id } = body;
  if (!store_link_id) return NextResponse.json({ error: "store_link_id required" }, { status: 400 });

  const sdb = createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!);

  const { data: link } = await sdb
    .from("store_links")
    .select("id")
    .eq("id", store_link_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Build update payload
  const update: Record<string, unknown> = { store_link_id };
  if (body.kakao_channel_id !== undefined) update.kakao_channel_id = body.kakao_channel_id;
  if (body.sender_number !== undefined) update.sender_number = body.sender_number;
  if (body.api_key !== undefined && body.api_key !== "") {
    update.api_key_enc = encryptPII(body.api_key);
  }
  if (body.setup_step !== undefined) update.setup_step = body.setup_step;
  if (body.connected !== undefined) update.connected = body.connected;

  const { data, error } = await sdb
    .from("send_channels")
    .upsert(update, { onConflict: "store_link_id" })
    .select("id, provider, kakao_channel_id, sender_number, setup_step, connected")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Test send in MOCK mode when step transitions to 4
  if (body.setup_step === 4 && data) {
    const row = await sdb
      .from("send_channels")
      .select("api_key_enc")
      .eq("store_link_id", store_link_id)
      .single();

    const encKey = (row.data as { api_key_enc?: string } | null)?.api_key_enc;
    if (encKey) {
      const { sendOne } = await import("@/lib/solapi");
      const testResult = await sendOne({
        channel: "sms",
        to: "01000000000",
        content: "[dangol] 연결 테스트 메시지",
        channelCreds: { apiKey: decryptPII(encKey) },
      });
      if (!testResult.ok) {
        return NextResponse.json({ error: "test_send_failed", detail: testResult.error }, { status: 422 });
      }
    }
  }

  return NextResponse.json({ channel: data });
}
