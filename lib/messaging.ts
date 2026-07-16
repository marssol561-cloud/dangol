// Server-only — real Solapi send via fallback chain.
import { getServerClient } from "./dangolDb";
import { decryptPII } from "./crypto";
import { sendOne, type SolapiChannel } from "./solapi";
import { resolveSegment, type SegmentType } from "./segments";
import { filterByConsent, filterNonDeleted, dailyCapOk, isDuplicate } from "./sendGuard";
import { getTemplate, type TemplateId } from "./templates";

const FALLBACK_ORDER: SolapiChannel[] = ["alimtalk", "email", "sms"];
// Dedupe window: 24h
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SendChannelRow {
  provider: string;
  kakao_channel_id: string | null;
  sender_number: string | null;
  api_key_enc: string | null;
  connected: boolean;
}

async function getChannelCreds(storeLinkId: string): Promise<SendChannelRow | null> {
  const db = getServerClient();
  const { data } = await db
    .from("send_channels")
    .select("provider, kakao_channel_id, sender_number, api_key_enc, connected")
    .eq("store_link_id", storeLinkId)
    .maybeSingle();
  return data as SendChannelRow | null;
}

function resolveContactForChannel(
  customer: { phone_enc: string | null; email_enc: string | null; kakao_enc: string | null },
  channel: SolapiChannel
): string | null {
  try {
    if (channel === "sms" && customer.phone_enc) return decryptPII(customer.phone_enc);
    if (channel === "email" && customer.email_enc) return decryptPII(customer.email_enc);
    if (channel === "alimtalk" && customer.phone_enc) return decryptPII(customer.phone_enc);
  } catch {
    return null;
  }
  return null;
}

export async function sendToSegment(
  storeLinkId: string,
  segment: SegmentType,
  templateId: TemplateId,
  templateVars: Record<string, string> = {},
  tag?: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = getServerClient();
  const template = getTemplate(templateId);
  const channelRow = await getChannelCreds(storeLinkId);
  if (!channelRow || !channelRow.connected || !channelRow.api_key_enc) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const apiKey = decryptPII(channelRow.api_key_enc);

  const rawCustomers = await resolveSegment({ storeLinkId, type: segment, tag });
  // Exclude anonymized (deleted_at IS NOT NULL) customers — double-guard in addition to segment filter
  const customers = await filterNonDeleted(rawCustomers);
  if (customers.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const capOk = await dailyCapOk(storeLinkId);
  if (!capOk) return { sent: 0, failed: 0, skipped: customers.length };

  let sent = 0, failed = 0, skipped = 0;

  for (const customer of customers) {
    const dup = await isDuplicate(customer.id, templateId, DEDUPE_WINDOW_MS);
    if (dup) { skipped++; continue; }

    let channelUsed: SolapiChannel | null = null;
    let msgId = "";
    let sendOk = false;

    const unsubLink = customer.unsub_token
      ? `\n\n수신거부: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/unsubscribe?t=${customer.unsub_token}`
      : "";
    const content = template.body({ ...templateVars, customerName: customer.name ?? "" }) + unsubLink;

    for (const channel of FALLBACK_ORDER) {
      if (channel === "alimtalk" && !channelRow.kakao_channel_id) continue;

      const consentCh = channel === "alimtalk" ? "kakao" : (channel as "sms" | "email");
      const consented = await filterByConsent([customer], consentCh);
      if (consented.length === 0) continue;

      const to = resolveContactForChannel(customer, channel);
      if (!to) continue;

      const result = await sendOne({
        channel,
        to,
        content,
        templateId,
        channelCreds: {
          apiKey,
          senderId: channelRow.sender_number ?? undefined,
          kakaoChannelId: channelRow.kakao_channel_id ?? undefined,
        },
      });

      if (result.ok) {
        channelUsed = channel;
        msgId = result.provider_msg_id;
        sendOk = true;
        break;
      }
    }

    await db.from("messages").insert({
      store_link_id: storeLinkId,
      customer_id: customer.id,
      channel: channelUsed ?? "sms",
      template_id: templateId,
      content,
      status: sendOk ? "sent" : "failed",
      provider_msg_id: msgId || null,
      sent_at: sendOk ? new Date().toISOString() : null,
    });

    sendOk ? sent++ : failed++;
  }

  return { sent, failed, skipped };
}

export async function sendCoupon(couponId: string): Promise<{ queued: true }> {
  const db = getServerClient();

  const { data: coupon } = await db
    .from("coupons")
    .select("id, store_link_id, customer_id, benefit, code")
    .eq("id", couponId)
    .maybeSingle();

  if (!coupon) return { queued: true };
  const c = coupon as { id: string; store_link_id: string; customer_id: string; benefit?: string; code: string };

  const { data: customer } = await db
    .from("customers")
    .select("id, phone_enc, email_enc, kakao_enc, name")
    .eq("id", c.customer_id)
    .maybeSingle();

  if (!customer) return { queued: true };
  const cu = customer as { id: string; phone_enc: string | null; email_enc: string | null; kakao_enc: string | null; name: string | null };

  const { data: store } = await db
    .from("store_links")
    .select("store_name")
    .eq("id", c.store_link_id)
    .maybeSingle();

  const channelRow = await getChannelCreds(c.store_link_id);
  if (!channelRow?.connected || !channelRow.api_key_enc) return { queued: true };

  const apiKey = decryptPII(channelRow.api_key_enc);
  const template = getTemplate("coupon_issued");
  const vars = {
    storeName: (store as { store_name?: string } | null)?.store_name ?? "",
    benefit: c.benefit ?? "",
    couponCode: c.code,
    expiresAt: "",
  };
  const content = template.body(vars);

  for (const channel of FALLBACK_ORDER) {
    if (channel === "alimtalk" && !channelRow.kakao_channel_id) continue;

    const to = resolveContactForChannel(cu, channel);
    if (!to) continue;

    const result = await sendOne({
      channel,
      to,
      content,
      templateId: "coupon_issued",
      channelCreds: {
        apiKey,
        senderId: channelRow.sender_number ?? undefined,
        kakaoChannelId: channelRow.kakao_channel_id ?? undefined,
      },
    });

    await db.from("messages").insert({
      store_link_id: c.store_link_id,
      customer_id: c.customer_id,
      channel,
      template_id: "coupon_issued",
      content,
      status: result.ok ? "sent" : "failed",
      provider_msg_id: result.ok ? result.provider_msg_id : null,
      sent_at: result.ok ? new Date().toISOString() : null,
    });

    if (result.ok) break;
  }

  return { queued: true };
}
