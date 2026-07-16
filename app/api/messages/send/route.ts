// A6 — owner sends segmented message
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isNightBlocked } from "@/lib/sendGuard";
import { sendToSegment } from "@/lib/messaging";
import type { SegmentType } from "@/lib/segments";
import type { TemplateId } from "@/lib/templates";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!
  );
  const { data: { user } } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    store_link_id: string;
    segment: SegmentType;
    template_id: TemplateId;
    template_vars?: Record<string, string>;
    tag?: string;
  };

  const { store_link_id, segment, template_id, template_vars, tag } = body;
  if (!store_link_id || !segment || !template_id) {
    return NextResponse.json({ error: "store_link_id, segment, template_id required" }, { status: 400 });
  }
  if (segment === "tag" && !tag?.trim()) {
    return NextResponse.json({ error: "tag required for tag segment" }, { status: 400 });
  }

  // Verify owner
  const sdb = createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!);
  const { data: link } = await sdb
    .from("store_links")
    .select("id")
    .eq("id", store_link_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (isNightBlocked()) {
    return NextResponse.json({ error: "night_blocked", message: "21:00-08:00 KST 발송 불가" }, { status: 422 });
  }

  const result = await sendToSegment(store_link_id, segment, template_id, template_vars ?? {}, tag);
  return NextResponse.json(result);
}
