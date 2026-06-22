import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/dangolDb";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const db = getServerClient();
  const { data, error } = await db
    .from("store_links")
    .select("store_name")
    .eq("store_code", code)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "매장을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ store_name: data.store_name ?? "" });
}
