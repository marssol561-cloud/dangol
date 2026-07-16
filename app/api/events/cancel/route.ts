// A5 — staff/owner cancels a pending event participation
import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { cancelParticipation } from "@/lib/events";

export async function POST(req: NextRequest) {
  const ctx = await getOwnerContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "staff")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { participationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { participationId } = body;
  if (!participationId) {
    return NextResponse.json({ error: "participationId가 필요합니다." }, { status: 400 });
  }

  const db = getServerClient();
  const result = await cancelParticipation(db, participationId, ctx.storeLinkId);

  if ("error" in result) {
    const status = result.error === "not_pending" ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
