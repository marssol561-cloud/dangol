import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/dangolDb";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const browserToken = cookieStore.get("dangol_bt")?.value;
  if (!browserToken) {
    return NextResponse.json({ coupons: [] });
  }

  // Resolve store_code from query param
  const storeCode = req.nextUrl.searchParams.get("store_code");
  if (!storeCode) {
    return NextResponse.json({ error: "store_code가 필요합니다." }, { status: 400 });
  }

  const db = getServerClient();

  const { data: storeLink } = await db
    .from("store_links")
    .select("id")
    .eq("store_code", storeCode)
    .maybeSingle();

  if (!storeLink) return NextResponse.json({ coupons: [] });
  const storeLinkId = (storeLink as { id: string }).id;

  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("store_link_id", storeLinkId)
    .eq("browser_token", browserToken)
    .maybeSingle();

  if (!customer) return NextResponse.json({ coupons: [] });
  const customerId = (customer as { id: string }).id;

  const { data: coupons, error } = await db
    .from("coupons")
    .select("code, kind, benefit, expires_at")
    .eq("customer_id", customerId)
    .eq("store_link_id", storeLinkId)
    .eq("status", "issued");

  if (error) return NextResponse.json({ error: "쿠폰 조회 실패" }, { status: 500 });

  return NextResponse.json({ coupons: coupons ?? [] });
}
