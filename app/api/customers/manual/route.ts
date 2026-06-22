import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { hashPII, encryptPII } from "@/lib/crypto";

type Channel = "phone" | "email" | "kakao";

interface ManualAddPayload {
  channel: Channel;
  identifier: string;
  name?: string;
  consents: {
    required: boolean;
    thirdparty?: boolean;
    ad_sms?: boolean;
    ad_kakao?: boolean;
    ad_email?: boolean;
  };
}

export async function POST(req: NextRequest) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ManualAddPayload;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const { channel, identifier, name, consents } = body;
  if (!channel || !identifier) return NextResponse.json({ error: "channel and identifier required" }, { status: 400 });
  if (!consents?.required) return NextResponse.json({ error: "Required consent missing" }, { status: 400 });

  const db = getServerClient();

  // Check duplicate
  const hashCol = `${channel}_hash` as const;
  const hash = hashPII(identifier, channel);
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("store_link_id", ctx.storeLinkId)
    .eq(hashCol, hash)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "이미 등록된 고객입니다." }, { status: 409 });

  const enc = encryptPII(identifier);
  const insertRow: Record<string, unknown> = {
    store_link_id: ctx.storeLinkId,
    name: name ?? null,
    grade: "normal",
    visit_count: 0,
    visit_purpose: "직접등록",
  };
  insertRow[`${channel}_hash`] = hash;
  insertRow[`${channel}_enc`] = enc;

  const { data: newCustomer, error: insertErr } = await db
    .from("customers")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertErr || !newCustomer) return NextResponse.json({ error: "등록 실패" }, { status: 500 });
  const customerId = (newCustomer as { id: string }).id;

  // Insert consents
  const now = new Date().toISOString();
  const allConsents: [string, boolean][] = [
    ["required", true],
    ["thirdparty", consents.thirdparty ?? false],
    ["ad_sms", consents.ad_sms ?? false],
    ["ad_kakao", consents.ad_kakao ?? false],
    ["ad_email", consents.ad_email ?? false],
  ];
  const consentRows = allConsents
    .filter(([, agreed]) => agreed)
    .map(([type]) => ({ customer_id: customerId, store_link_id: ctx.storeLinkId, type, agreed: true, agreed_at: now }));

  if (consentRows.length > 0) await db.from("consents").insert(consentRows);

  // NEVER return plaintext contact
  return NextResponse.json({ customer_id: customerId }, { status: 201 });
}
