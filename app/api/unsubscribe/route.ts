// Public — no auth required. Access controlled by per-customer unsub_token.
// GET: resolve token → return consent state
// POST: apply opt-out / withdrawal actions
import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/dangolDb";
import { resolveByToken, optOut, withdrawConsent } from "@/lib/unsubscribe";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!token) {
    return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
  }

  const customer = await resolveByToken(token);
  if (!customer) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }

  const db = getServerClient();

  // Fetch current ad + thirdparty consent state (agreed=true AND revoked_at IS NULL)
  const { data: consentsRows } = await db
    .from("consents")
    .select("type, agreed, revoked_at")
    .eq("customer_id", customer.id)
    .in("type", ["ad_sms", "ad_kakao", "ad_email", "thirdparty"]);

  const active: Record<string, boolean> = {
    ad_sms: false,
    ad_kakao: false,
    ad_email: false,
    thirdparty: false,
  };

  for (const row of (consentsRows ?? []) as { type: string; agreed: boolean; revoked_at: string | null }[]) {
    if (row.agreed && !row.revoked_at) {
      active[row.type] = true;
    }
  }

  return NextResponse.json({
    customerId: customer.id,
    storeLinkId: customer.store_link_id,
    activeConsents: {
      ad_sms: active.ad_sms,
      ad_kakao: active.ad_kakao,
      ad_email: active.ad_email,
      thirdparty: active.thirdparty,
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { token: string; optOut?: string[]; withdraw?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { token, optOut: optOutChannels = [], withdraw: withdrawTypes = [] } = body;

  if (!token) {
    return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
  }

  const customer = await resolveByToken(token);
  if (!customer) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }

  const VALID_CHANNELS = ["sms", "kakao", "email"] as const;
  const VALID_WITHDRAW = ["required", "thirdparty", "ad_sms", "ad_kakao", "ad_email"] as const;

  for (const ch of optOutChannels) {
    if (!VALID_CHANNELS.includes(ch as typeof VALID_CHANNELS[number])) continue;
    await optOut(customer.id, customer.store_link_id, ch as "sms" | "kakao" | "email");
  }

  for (const type of withdrawTypes) {
    if (!VALID_WITHDRAW.includes(type as typeof VALID_WITHDRAW[number])) continue;
    await withdrawConsent(
      customer.id,
      customer.store_link_id,
      type as "required" | "thirdparty" | "ad_sms" | "ad_kakao" | "ad_email"
    );
  }

  return NextResponse.json({ ok: true });
}
