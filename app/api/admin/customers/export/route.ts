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
    .from("unified_customers")
    .select("id, identifier_hash, store_count, first_seen_at, created_at")
    .order("first_seen_at", { ascending: false });

  const rows = (data ?? []) as {
    id: string;
    identifier_hash: string;
    store_count: number;
    first_seen_at: string;
    created_at: string;
  }[];

  // Write audit log — plaintext contact is NEVER included (hash only)
  await db.from("audit_logs").insert({
    admin_user: user.id,
    action: "export",
    target: "unified_customers",
    count: rows.length,
  });

  // Build CSV (hash only — no plaintext contact)
  const header = "id,identifier_hash,store_count,first_seen_at,created_at";
  const body = rows
    .map(
      (r) =>
        `${r.id},${r.identifier_hash},${r.store_count},${r.first_seen_at},${r.created_at}`
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
