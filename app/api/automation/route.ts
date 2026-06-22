// A7 — automation_rules GET/PUT (owner)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { data, error } = await sdb
    .from("automation_rules")
    .select("id, type, enabled, params, template_id")
    .eq("store_link_id", storeLinkId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const user = await resolveOwner(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    store_link_id: string;
    type: "churn" | "anniversary";
    enabled: boolean;
    params?: Record<string, unknown>;
    template_id?: string;
  };

  const { store_link_id, type, enabled, params, template_id } = body;
  if (!store_link_id || !type) {
    return NextResponse.json({ error: "store_link_id, type required" }, { status: 400 });
  }

  const sdb = createClient(process.env.DANGOL_DB_URL!, process.env.DANGOL_DB_SERVICE_ROLE_KEY!);

  const { data: link } = await sdb
    .from("store_links")
    .select("id")
    .eq("id", store_link_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await sdb
    .from("automation_rules")
    .upsert(
      { store_link_id, type, enabled: enabled ?? false, params: params ?? null, template_id: template_id ?? null },
      { onConflict: "store_link_id,type" }
    )
    .select("id, type, enabled, params, template_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}
