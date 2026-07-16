// A5 — staff/owner lists today's pending event participations for their store
import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { listPendingApprovals } from "@/lib/events";

export async function GET() {
  const ctx = await getOwnerContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "staff")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServerClient();
  const pending = await listPendingApprovals(db, ctx.storeLinkId);
  return NextResponse.json({ pending });
}
