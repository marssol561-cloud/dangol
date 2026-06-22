import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();

  const { data } = await db
    .from("consents")
    .select("type, agreed, revoked_at");

  const rows = (data ?? []) as { type: string; agreed: boolean; revoked_at: string | null }[];

  const stats: Record<string, { agreed: number; declined: number; revoked: number }> = {};
  for (const r of rows) {
    if (!stats[r.type]) stats[r.type] = { agreed: 0, declined: 0, revoked: 0 };
    if (r.revoked_at) stats[r.type].revoked++;
    else if (r.agreed) stats[r.type].agreed++;
    else stats[r.type].declined++;
  }

  return NextResponse.json({ consent_stats: stats, total_records: rows.length });
}
