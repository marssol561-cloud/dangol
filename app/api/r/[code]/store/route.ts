import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/dangolDb";
import { resolveStoreEvent } from "@/lib/events";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const db = getServerClient();
  const { data, error } = await db
    .from("store_links")
    .select("id, store_name")
    .eq("store_code", code)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "매장을 찾을 수 없습니다." }, { status: 404 });
  }

  const resolution = await resolveStoreEvent(db, data.id);

  const body: {
    store_name: string;
    event?: { id: string; type: string; title: string; description: string | null; reward_benefit: string | null };
    eventClosed?: true;
  } = { store_name: data.store_name ?? "" };

  if (resolution.state === "active") {
    const { id, type, title, description, reward_benefit } = resolution.event;
    body.event = { id, type, title, description, reward_benefit };
  } else if (resolution.state === "closed") {
    body.eventClosed = true;
  }

  return NextResponse.json(body);
}
