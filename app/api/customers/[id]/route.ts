import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import { decryptPII } from "@/lib/crypto";
import { maskPhone, maskEmail, maskKakao } from "@/lib/maskPii";
import { computeGradeDisplay, GRADE_LABEL } from "@/lib/grade";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServerClient();

  // Customer must belong to owner's store_link
  const { data: cRow } = await db
    .from("customers")
    .select("id, name, grade, visit_count, last_visit_at, phone_enc, email_enc, kakao_enc, memo, created_at, store_link_id, visit_purpose, companion")
    .eq("id", id)
    .eq("store_link_id", ctx.storeLinkId)
    .maybeSingle();

  if (!cRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = cRow as Record<string, unknown>;

  // Masked contact
  let displayContact: string | null = null;
  let channel: string | null = null;
  try {
    if (c.phone_enc) { displayContact = maskPhone(decryptPII(c.phone_enc as string)); channel = "phone"; }
    else if (c.email_enc) { displayContact = maskEmail(decryptPII(c.email_enc as string)); channel = "email"; }
    else if (c.kakao_enc) { displayContact = maskKakao(decryptPII(c.kakao_enc as string)); channel = "kakao"; }
  } catch { displayContact = "***"; }

  // Monthly visits for grade display
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count: monthlyVisits } = await db
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .gte("visited_at", monthStart);

  const displayGrade = computeGradeDisplay(c.visit_count as number, monthlyVisits ?? 0);

  // Visit timeline (latest 20)
  const { data: visits } = await db
    .from("visits")
    .select("id, visited_at, stamp_delta, source")
    .eq("customer_id", id)
    .eq("store_link_id", ctx.storeLinkId)
    .order("visited_at", { ascending: false })
    .limit(20);

  // Stamp status
  const { data: stampsPolicy } = await db
    .from("stamps_rewards")
    .select("required_count, reward_desc")
    .eq("store_link_id", ctx.storeLinkId)
    .maybeSingle();
  const required = (stampsPolicy as { required_count: number } | null)?.required_count ?? 10;
  const currentStamps = (c.visit_count as number) % required;

  // Message history (latest 10, no content)
  const { data: messages } = await db
    .from("messages")
    .select("id, channel, template_id, status, created_at")
    .eq("customer_id", id)
    .eq("store_link_id", ctx.storeLinkId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Consents
  const { data: consents } = await db
    .from("consents")
    .select("type, agreed, agreed_at")
    .eq("customer_id", id)
    .eq("agreed", true);

  return NextResponse.json({
    customer: {
      id: c.id,
      name: c.name ?? null,
      displayContact,
      channel,
      grade: displayGrade,
      gradeLabel: GRADE_LABEL[displayGrade],
      visit_count: c.visit_count,
      last_visit_at: c.last_visit_at ?? null,
      visit_purpose: c.visit_purpose ?? null,
      companion: c.companion ?? null,
      memo: c.memo ?? null,
      created_at: c.created_at,
    },
    stamps: { current: currentStamps, required, rewardDesc: (stampsPolicy as { reward_desc: string } | null)?.reward_desc ?? null },
    visits: visits ?? [],
    messages: messages ?? [],
    consents: consents ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { memo?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const db = getServerClient();

  // Verify ownership before update
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("store_link_id", ctx.storeLinkId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db
    .from("customers")
    .update({ memo: body.memo ?? null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
