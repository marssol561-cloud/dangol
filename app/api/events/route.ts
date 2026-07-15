// A10 — owner lists/creates events
import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { listStoreEvents, createEvent, type EventInput } from "@/lib/events";

export async function GET() {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServerClient();
  const events = await listStoreEvents(db, ctx.storeLinkId);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as EventInput;
  const db = getServerClient();
  const result = await createEvent(db, ctx.storeLinkId, ctx.userId, body);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ event: result.event });
}
