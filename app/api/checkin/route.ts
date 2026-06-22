import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkInCustomer } from "@/lib/checkin";

export async function POST(req: NextRequest) {
  let body: { store_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { store_code } = body;
  if (!store_code) {
    return NextResponse.json({ error: "store_code가 필요합니다." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const browserToken = cookieStore.get("dangol_bt")?.value;
  if (!browserToken) {
    return NextResponse.json({ accrued: false, reason: "no_customer" });
  }

  const result = await checkInCustomer(browserToken, store_code);
  return NextResponse.json(result);
}
