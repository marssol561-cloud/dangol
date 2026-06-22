import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/dangolDb";
import { getSessionUser } from "@/lib/auth.server";

async function resolveOwnerStoreLinkId(userId: string): Promise<string | null> {
  const db = getServerClient();
  const { data } = await db
    .from("owners")
    .select("store_link_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as { store_link_id: string | null } | null)?.store_link_id ?? null;
}

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const storeLinkId = await resolveOwnerStoreLinkId(user.id);
  if (!storeLinkId) return NextResponse.json({ error: "매장 미연결" }, { status: 403 });

  const db = getServerClient();
  const { data } = await db
    .from("stamps_rewards")
    .select("required_count, reward_desc, service_a, service_b, service_c")
    .eq("store_link_id", storeLinkId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({
      required_count: 10,
      reward_desc: null,
      service_a: null,
      service_b: null,
      service_c: null,
    });
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const storeLinkId = await resolveOwnerStoreLinkId(user.id);
  if (!storeLinkId) return NextResponse.json({ error: "매장 미연결" }, { status: 403 });

  let body: {
    required_count?: number;
    reward_desc?: string;
    service_a?: string;
    service_b?: string;
    service_c?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const db = getServerClient();

  const upsertRow = {
    store_link_id: storeLinkId,
    required_count: body.required_count ?? 10,
    reward_desc: body.reward_desc ?? null,
    service_a: body.service_a ?? null,
    service_b: body.service_b ?? null,
    service_c: body.service_c ?? null,
  };

  const { data, error } = await db
    .from("stamps_rewards")
    .upsert(upsertRow, { onConflict: "store_link_id" })
    .select("required_count, reward_desc, service_a, service_b, service_c")
    .single();

  if (error) return NextResponse.json({ error: "저장 실패" }, { status: 500 });

  return NextResponse.json(data);
}
