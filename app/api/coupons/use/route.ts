import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/dangolDb";
import { getSessionUser } from "@/lib/auth.server";

export async function POST(req: NextRequest) {
  // Require authenticated owner or staff
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { code } = body;
  if (!code) {
    return NextResponse.json({ error: "쿠폰 코드가 필요합니다." }, { status: 400 });
  }

  const db = getServerClient();

  // Verify owner/staff belongs to the same store as the coupon
  const { data: ownerRow } = await db
    .from("owners")
    .select("store_link_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!ownerRow) {
    return NextResponse.json({ error: "매장 정보를 찾을 수 없습니다." }, { status: 403 });
  }

  const { store_link_id: ownerStoreLinkId } = ownerRow as {
    store_link_id: string | null;
    role: string;
  };

  if (!ownerStoreLinkId) {
    return NextResponse.json({ error: "매장이 연결되지 않았습니다." }, { status: 403 });
  }

  // Find coupon by code, scoped to owner's store_link
  const { data: coupon } = await db
    .from("coupons")
    .select("id, status, expires_at, store_link_id")
    .eq("code", code.toUpperCase())
    .eq("store_link_id", ownerStoreLinkId)
    .maybeSingle();

  if (!coupon) {
    return NextResponse.json({ valid: false, reason: "not_found" }, { status: 404 });
  }

  const cp = coupon as {
    id: string;
    status: string;
    expires_at: string | null;
    store_link_id: string;
  };

  if (cp.status === "used") {
    return NextResponse.json({ valid: false, reason: "already_used" });
  }

  if (cp.status === "expired" || (cp.expires_at && new Date(cp.expires_at) < new Date())) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }

  // Mark used — NO visits or stamp_delta change
  const { error: updateErr } = await db
    .from("coupons")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", cp.id);

  if (updateErr) {
    return NextResponse.json({ error: "쿠폰 처리 실패" }, { status: 500 });
  }

  return NextResponse.json({ valid: true, reason: "ok" });
}
