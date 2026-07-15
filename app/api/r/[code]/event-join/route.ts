// B2 — customer submits identity + both mandatory consents to join the store's active event.
// Creates a PENDING participation only. Coupon issuance is staff approval (SP-E4), not here.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/dangolDb";
import { createParticipation } from "@/lib/events";

type Channel = "phone" | "kakao" | "email";

interface EventJoinPayload {
  channel: Channel;
  identifier: string;
  name?: string;
  visit_purpose?: string;
  companion?: string;
  consents: {
    required: boolean;
    thirdparty: boolean;
    ad_sms: boolean;
    ad_kakao: boolean;
    ad_email: boolean;
  };
  browser_token?: string;
}

const ERROR_STATUS: Record<string, number> = {
  no_active_event: 422,
  consent_required: 422,
  thirdparty_required: 422,
  store_not_found: 404,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: EventJoinPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!body.channel || !body.identifier || !body.consents) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }

  const db = getServerClient();
  const result = await createParticipation(db, {
    storeCode: code,
    channel: body.channel,
    identifier: body.identifier,
    name: body.name,
    visitPurpose: body.visit_purpose,
    companion: body.companion,
    consents: body.consents,
    browserToken: body.browser_token,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] ?? 422 });
  }

  const cookieStore = await cookies();
  cookieStore.set("dangol_bt", result.browserToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return NextResponse.json({ status: result.status });
}
