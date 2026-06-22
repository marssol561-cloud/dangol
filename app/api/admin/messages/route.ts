import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();

  const [{ data: msgs }, { data: channels }] = await Promise.all([
    db.from("messages").select("channel, status"),
    db.from("send_channels").select("store_link_id, provider, sender_number, connected, setup_step"),
  ]);

  // Aggregate per channel × status
  const aggMap: Record<string, { sent: number; failed: number; pending: number }> = {};
  for (const m of (msgs ?? []) as { channel: string; status: string }[]) {
    if (!aggMap[m.channel]) aggMap[m.channel] = { sent: 0, failed: 0, pending: 0 };
    if (m.status === "sent") aggMap[m.channel].sent++;
    else if (m.status === "failed") aggMap[m.channel].failed++;
    else aggMap[m.channel].pending++;
  }

  return NextResponse.json({
    channel_stats: aggMap,
    send_channels: channels ?? [],
  });
}
