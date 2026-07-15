// A10 — owner reads/edits a single event
import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { getEventDetail, updateEvent, type EventInput } from "@/lib/events";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServerClient();
  const detail = await getEventDetail(db, id, ctx.storeLinkId);
  if (!detail) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as EventInput;
  const db = getServerClient();
  const result = await updateEvent(db, id, ctx.storeLinkId, body);

  if ("notFound" in result) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ event: result.event });
}
