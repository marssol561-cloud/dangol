import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import { getUnifiedTagMap, getUnifiedIdsByTag, listDistinctTags } from "@/lib/events";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");

  const availableTags = await listDistinctTags(db);

  let allowedIds: string[] | null = null;
  if (tag) {
    allowedIds = await getUnifiedIdsByTag(db, tag);
    if (allowedIds.length === 0) {
      return NextResponse.json({ customers: [], total: 0, availableTags });
    }
  }

  let query = db
    .from("unified_customers")
    .select("id, identifier_hash, channels, store_count, first_seen_at", { count: "exact" })
    .order("first_seen_at", { ascending: false });

  if (allowedIds) query = query.in("id", allowedIds);

  const { data, count } = await query;
  const customers = (data ?? []) as { id: string }[];
  const tagMap = await getUnifiedTagMap(db, customers.map((c) => c.id));
  const withTags = customers.map((c) => ({ ...c, tags: tagMap[c.id] ?? [] }));

  return NextResponse.json({ customers: withTags, total: count ?? 0, availableTags });
}
