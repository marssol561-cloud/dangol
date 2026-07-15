// A10 — preannounce audience preview + send (reuses sendToSegment/isNightBlocked via lib/events)
import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { previewAnnounce, sendAnnounce } from "@/lib/events";
import type { SegmentType } from "@/lib/segments";
import type { TemplateId } from "@/lib/templates";

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_preannounce: 422,
  night_blocked: 422,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as {
    store_link_id: string;
    segment: SegmentType;
    template_id: TemplateId;
    template_vars?: Record<string, string>;
    preview: boolean;
  };

  if (body.store_link_id !== ctx.storeLinkId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!body.segment || !body.template_id) {
    return NextResponse.json({ error: "segment, template_id required" }, { status: 400 });
  }

  const db = getServerClient();

  if (body.preview) {
    const result = await previewAnnounce(db, id, ctx.storeLinkId, body.segment);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] });
    return NextResponse.json(result);
  }

  const result = await sendAnnounce(db, id, ctx.storeLinkId, body.segment, body.template_id, body.template_vars ?? {});
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] });
  return NextResponse.json(result);
}
