// B2/B3 — participation status polling + returning-customer consent branch + upcoming-preannounce banner.
// browser_token can arrive as a query param, but the client cannot read the httpOnly
// dangol_bt cookie's value directly (see app/api/customers/route.ts's Set-Cookie), so
// when neither browser_token nor channel+identifier is supplied, this route falls back
// to reading the httpOnly cookie server-side itself — same pattern as /api/checkin.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/dangolDb";
import { getParticipationStatus, listUpcomingPreannounce } from "@/lib/events";

type Channel = "phone" | "kakao" | "email";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel") as Channel | null;
  const identifier = searchParams.get("identifier");
  let browserToken = searchParams.get("browser_token") ?? undefined;

  if (!browserToken && !(channel && identifier)) {
    const cookieStore = await cookies();
    browserToken = cookieStore.get("dangol_bt")?.value;
  }

  const db = getServerClient();

  const { data: storeLink } = await db.from("store_links").select("id").eq("store_code", code).maybeSingle();
  if (!storeLink) return NextResponse.json({ error: "매장을 찾을 수 없습니다." }, { status: 404 });
  const storeLinkId = (storeLink as { id: string }).id;

  const upcomingPreannounce = await listUpcomingPreannounce(db, storeLinkId);

  const lookup = channel && identifier ? { channel, identifier } : browserToken ? { browserToken } : null;
  if (!lookup) {
    return NextResponse.json({
      participation: null,
      existingConsents: { required: false, thirdparty: false },
      upcomingPreannounce,
    });
  }

  const statusResult = await getParticipationStatus(db, code, lookup);
  if ("error" in statusResult) return NextResponse.json({ error: statusResult.error }, { status: 404 });

  return NextResponse.json({ ...statusResult, upcomingPreannounce });
}
