import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/dangolDb";
import { hashPII, encryptPII } from "@/lib/crypto";
import { issueFirstCoupon, issueReferralCoupon } from "@/lib/coupons";
import { sendCoupon } from "@/lib/messaging";
import { linkUnifiedIfConsented } from "@/lib/unified";

type Channel = "phone" | "kakao" | "email";

interface CustomerPayload {
  store_code: string;
  channel: Channel;
  identifier: string;
  name?: string;
  visit_purpose: string;
  companion?: string;
  consents: {
    required: boolean;
    thirdparty: boolean;
    ad_sms: boolean;
    ad_kakao: boolean;
    ad_email: boolean;
  };
  browser_token?: string;
  ref?: string;  // referrer browser_token
}

export async function POST(req: NextRequest) {
  let body: CustomerPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { store_code, channel, identifier, name, visit_purpose, companion, consents, browser_token: clientToken, ref: refToken } = body;

  if (!store_code || !channel || !identifier || !visit_purpose) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }

  if (!consents?.required) {
    return NextResponse.json({ error: "필수 동의가 필요합니다." }, { status: 400 });
  }

  const db = getServerClient();

  // 1. Resolve store_link_id from store_code
  const { data: storeLink, error: storeErr } = await db
    .from("store_links")
    .select("id")
    .eq("store_code", store_code)
    .maybeSingle();

  if (storeErr || !storeLink) {
    return NextResponse.json({ error: "매장을 찾을 수 없습니다." }, { status: 404 });
  }
  const storeLinkId = storeLink.id as string;

  // 2. Hash identifier for deduplication lookup
  const hash = hashPII(identifier, channel);
  const hashCol = `${channel}_hash` as const;

  // 3. Look up existing customer by (store_link_id, *_hash)
  const { data: existing } = await db
    .from("customers")
    .select("id, browser_token")
    .eq("store_link_id", storeLinkId)
    .eq(hashCol, hash)
    .maybeSingle();

  let customerId: string;
  let browserToken: string;

  if (existing) {
    // Returning customer — reuse
    customerId = existing.id as string;
    browserToken = (existing.browser_token as string) ?? generateBrowserToken();
  } else {
    // New customer — encrypt + store
    const enc = encryptPII(identifier);
    browserToken = clientToken ?? generateBrowserToken();

    const insertRow: Record<string, unknown> = {
      store_link_id: storeLinkId,
      visit_purpose,
      companion: companion ?? null,
      name: name ?? null,
      browser_token: browserToken,
      unsub_token: generateBrowserToken(), // unique opt-out token per customer
      grade: "normal",
      visit_count: 0,
    };
    insertRow[`${channel}_hash`] = hash;
    insertRow[`${channel}_enc`] = enc;

    const { data: newCustomer, error: insertErr } = await db
      .from("customers")
      .insert(insertRow)
      .select("id")
      .single();

    if (insertErr || !newCustomer) {
      return NextResponse.json({ error: "고객 등록 실패" }, { status: 500 });
    }
    customerId = (newCustomer as { id: string }).id;

    // Link to unified_customers if thirdparty consent given (new customer only)
    if (consents.thirdparty) {
      await linkUnifiedIfConsented(customerId, hash, storeLinkId, consents).catch(() => {
        // Non-fatal: unified link failure must not block customer registration
      });
    }
  }

  // 4. INSERT consents (required always; optional only if true)
  const consentRows: Array<{
    customer_id: string;
    store_link_id: string;
    type: string;
    agreed: boolean;
    agreed_at: string | null;
  }> = [];
  const now = new Date().toISOString();

  const allConsents: [string, boolean][] = [
    ["required", consents.required],
    ["thirdparty", consents.thirdparty],
    ["ad_sms", consents.ad_sms],
    ["ad_kakao", consents.ad_kakao],
    ["ad_email", consents.ad_email],
  ];

  for (const [type, agreed] of allConsents) {
    if (agreed) {
      consentRows.push({ customer_id: customerId, store_link_id: storeLinkId, type, agreed: true, agreed_at: now });
    }
  }

  if (consentRows.length > 0) {
    await db.from("consents").insert(consentRows);
  }

  // 5. Issue first coupon (kind 'A')
  const coupon = await issueFirstCoupon(customerId, storeLinkId);

  // 6. Stub send
  await sendCoupon(coupon.id);

  // 7. Handle referral if ref token present (new customer only)
  if (refToken && !existing) {
    const { data: referrerCustomer } = await db
      .from("customers")
      .select("id")
      .eq("store_link_id", storeLinkId)
      .eq("browser_token", refToken)
      .maybeSingle();

    if (referrerCustomer) {
      const referrerId = (referrerCustomer as { id: string }).id;
      await db.from("referrals").insert({
        store_link_id: storeLinkId,
        referrer_id: referrerId,
        invitee_id: customerId,
        status: "completed",
        reward_given: true,
      });
      // Issue C coupon to both referrer and invitee
      await issueReferralCoupon(referrerId, storeLinkId);
      await issueReferralCoupon(customerId, storeLinkId);
    }
  }

  // 8. Set browser_token cookie
  const cookieStore = await cookies();
  cookieStore.set("dangol_bt", browserToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  // NEVER return or log plaintext contact
  return NextResponse.json({ coupon_code: coupon.code, browser_token: browserToken });
}

function generateBrowserToken(): string {
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? require("crypto").webcrypto).getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
