import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { monthlyStats, consentRate, messageEffect, todayCards } from "@/lib/dashboard";
import { getEventBadges } from "@/lib/events";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServerClient();

  const [monthly, consent, effect, cards, sendChRow, eventBadges] = await Promise.all([
    monthlyStats(ctx.storeLinkId),
    consentRate(ctx.storeLinkId),
    messageEffect(ctx.storeLinkId),
    todayCards(ctx.storeLinkId),
    db.from("send_channels").select("setup_step, connected").eq("store_link_id", ctx.storeLinkId).maybeSingle(),
    getEventBadges(db, ctx.storeLinkId),
  ]);

  const sendChannel = (sendChRow.data as { setup_step: number; connected: boolean } | null) ?? {
    setup_step: 0,
    connected: false,
  };

  return NextResponse.json({ monthly, consent, effect, todayCards: cards, sendChannel, eventBadges });
}
