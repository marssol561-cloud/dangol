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
    .select("id, store_name, store_code, owner_id")
    .order("created_at", { ascending: false });

  const storeList = (stores ?? []) as { id: string }[];
  const storeIds = storeList.map((s) => s.id);

  const channelMap: Record<string, unknown> = {};
  if (storeIds.length > 0) {
    const { data: chs } = await db
      .from("send_channels")
      .select("store_link_id, setup_step, connected, provider")
      .in("store_link_id", storeIds);

    for (const c of (chs ?? []) as { store_link_id: string }[]) {
      channelMap[(c as { store_link_id: string }).store_link_id] = c;
    }
  }

  const result = storeList.map((s) => ({
    ...(s as object),
    channel: channelMap[(s as { id: string }).id] ?? null,
    needs_support: !channelMap[(s as { id: string }).id] || (channelMap[(s as { id: string }).id] as { setup_step: number }).setup_step < 4,
  }));

  const supportCount = result.filter((r) => r.needs_support).length;

  return NextResponse.json({ stores: result, support_count: supportCount, total: result.length });
}
