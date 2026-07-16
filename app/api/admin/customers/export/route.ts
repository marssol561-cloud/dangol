import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import { getUnifiedTagMap, getUnifiedIdsByTag } from "@/lib/events";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");

  let allowedIds: string[] | null = null;
  if (tag) allowedIds = await getUnifiedIdsByTag(db, tag);

  type Row = { id: string; identifier_hash: string; store_count: number; first_seen_at: string; created_at: string };
  let rows: Row[] = [];

  if (!tag || (allowedIds && allowedIds.length > 0)) {
    let query = db
      .from("unified_customers")
      .select("id, identifier_hash, store_count, first_seen_at, created_at")
      .order("first_seen_at", { ascending: false });
    if (allowedIds) query = query.in("id", allowedIds);
    const { data } = await query;
    rows = (data ?? []) as Row[];
  }

  const tagMap = await getUnifiedTagMap(db, rows.map((r) => r.id));

  const target = tag ? `unified_customers?tag=${tag}` : "unified_customers";

  // Write audit log — plaintext contact is NEVER included (hash only)
  await db.from("audit_logs").insert({
    admin_user: user.id,
    action: "export",
    target,
    count: rows.length,
  });

  // Build CSV (hash only — no plaintext contact)
  const header = "id,identifier_hash,store_count,first_seen_at,created_at,이벤트태그";
  const body = rows
    .map(
      (r) =>
        `${r.id},${r.identifier_hash},${r.store_count},${r.first_seen_at},${r.created_at},${(tagMap[r.id] ?? []).join(";")}`
    )
    .join("\n");

  const csv = `${header}\n${body}`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unified_customers_export.csv"`,
    },
  });
}
