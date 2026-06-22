// Server-only — token-based opt-out and consent withdrawal.
import { getServerClient } from "./dangolDb";

type AdConsentType = "ad_sms" | "ad_kakao" | "ad_email";
type WithdrawableType = "required" | "thirdparty" | AdConsentType;

export interface ResolvedCustomer {
  id: string;
  store_link_id: string;
}

export async function resolveByToken(token: string): Promise<ResolvedCustomer | null> {
  if (!token) return null;
  const db = getServerClient();
  const { data } = await db
    .from("customers")
    .select("id, store_link_id")
    .eq("unsub_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  return data as ResolvedCustomer | null;
}

export async function optOut(
  customerId: string,
  storeLinkId: string,
  channel: "sms" | "kakao" | "email"
): Promise<void> {
  const db = getServerClient();
  const consentType: AdConsentType = `ad_${channel}`;
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from("consents")
    .select("id")
    .eq("customer_id", customerId)
    .eq("type", consentType)
    .maybeSingle();

  if (existing) {
    await db.from("consents")
      .update({ agreed: false, revoked_at: now })
      .eq("customer_id", customerId)
      .eq("type", consentType);
  } else {
    await db.from("consents").insert({
      customer_id: customerId,
      store_link_id: storeLinkId,
      type: consentType,
      agreed: false,
      revoked_at: now,
    });
  }
}

export async function withdrawConsent(
  customerId: string,
  storeLinkId: string,
  type: WithdrawableType
): Promise<void> {
  const db = getServerClient();
  const now = new Date().toISOString();

  await db.from("consents")
    .update({ agreed: false, revoked_at: now })
    .eq("customer_id", customerId)
    .eq("type", type);

  if (type === "thirdparty") {
    // Detach from unified_customers and decrement store_count
    const { data: customer } = await db
      .from("customers")
      .select("unified_id")
      .eq("id", customerId)
      .maybeSingle();

    const unifiedId = (customer as { unified_id: string | null } | null)?.unified_id ?? null;
    if (unifiedId) {
      const { data: uni } = await db
        .from("unified_customers")
        .select("store_count")
        .eq("id", unifiedId)
        .maybeSingle();

      const count = (uni as { store_count: number } | null)?.store_count ?? 0;
      if (count <= 1) {
        await db.from("unified_customers").delete().eq("id", unifiedId);
      } else {
        await db.from("unified_customers")
          .update({ store_count: count - 1 })
          .eq("id", unifiedId);
      }
      await db.from("customers").update({ unified_id: null }).eq("id", customerId);
    }
  }
  // type === "required": purge cron will pick it up via scanPurgeTargets
}
