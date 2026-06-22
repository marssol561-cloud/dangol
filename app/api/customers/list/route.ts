import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getCustomersList } from "@/lib/dashboard";

export async function GET(req: NextRequest) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const grade = searchParams.get("grade") ?? undefined;
  const channel = searchParams.get("channel") ?? undefined;
  const lastVisitDays = searchParams.get("lastVisitDays")
    ? parseInt(searchParams.get("lastVisitDays")!)
    : undefined;

  const customers = await getCustomersList(ctx.storeLinkId, { grade, channel, lastVisitDays });
  return NextResponse.json({ customers });
}
