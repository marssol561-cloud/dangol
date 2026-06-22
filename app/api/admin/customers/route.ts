import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();

  const { data, count } = await db
    .from("unified_customers")
    .select("id, identifier_hash, channels, store_count, first_seen_at", { count: "exact" })
    .order("first_seen_at", { ascending: false });

  return NextResponse.json({ customers: data ?? [], total: count ?? 0 });
}
