import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();

  const [{ data: meta }, { count: adminCount }, { count: auditCount }, { data: recentAudit }] =
    await Promise.all([
      db.from("app_meta").select("key, value"),
      db.from("admins").select("id", { count: "exact", head: true }),
      db.from("audit_logs").select("id", { count: "exact", head: true }),
      db
        .from("audit_logs")
        .select("admin_user, action, target, count, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const metaMap: Record<string, string> = {};
  for (const r of (meta ?? []) as { key: string; value: string }[]) {
    metaMap[r.key] = r.value;
  }

  return NextResponse.json({
    schema_version: metaMap["schema_version"] ?? "unknown",
    admin_count: adminCount ?? 0,
    audit_log_count: auditCount ?? 0,
    recent_audit_logs: recentAudit ?? [],
  });
}
