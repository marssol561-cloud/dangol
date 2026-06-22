import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();

  const { data: stores } = await db
    .from("store_links")
    .select("id, store_code, store_name, address, created_at")
    .order("created_at", { ascending: false });

  const storeList = (stores ?? []) as { id: string }[];
  const storeIds = storeList.map((s) => s.id);

  const countsMap: Record<string, number> = {};
  const sentMap: Record<string, number> = {};

  if (storeIds.length > 0) {
    const [{ data: custs }, { data: msgs }] = await Promise.all([
      db.from("customers").select("store_link_id").in("store_link_id", storeIds),
      db.from("messages").select("store_link_id").in("store_link_id", storeIds).eq("status", "sent"),
    ]);

    for (const c of (custs ?? []) as { store_link_id: string }[]) {
      countsMap[c.store_link_id] = (countsMap[c.store_link_id] ?? 0) + 1;
    }
    for (const m of (msgs ?? []) as { store_link_id: string }[]) {
      sentMap[m.store_link_id] = (sentMap[m.store_link_id] ?? 0) + 1;
    }
  }

  const result = (stores ?? []).map((s: unknown) => {
    const store = s as { id: string; store_code: string; store_name: string | null; address: string | null; created_at: string };
    return {
      ...store,
      customer_count: countsMap[store.id] ?? 0,
      sent_count: sentMap[store.id] ?? 0,
    };
  });

  return NextResponse.json({ stores: result, total: result.length });
}
