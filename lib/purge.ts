// Server-only — customer anonymization and purge target scanning.
import { getServerClient } from "./dangolDb";

// Retention period: 2 years (LAWYER-PENDING §11 — named constant, not hardcoded policy)
export const RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export async function anonymizeCustomer(customerId: string): Promise<void> {
  const db = getServerClient();

  // Capture unified_id before nulling (needed for store_count decrement)
  const { data: customer } = await db
    .from("customers")
    .select("unified_id")
    .eq("id", customerId)
    .maybeSingle();

  const unifiedId = (customer as { unified_id: string | null } | null)?.unified_id ?? null;

  // Null all personal contact fields + memo; set deleted_at; detach unified.
  // visit_count, grade, stamps, visits are kept anonymously.
  await db.from("customers").update({
    phone_enc:  null,
    phone_hash: null,
    kakao_enc:  null,
    kakao_hash: null,
    email_enc:  null,
    email_hash: null,
    name:       null,
    memo:       null,
    deleted_at: new Date().toISOString(),
    unified_id: null,
  }).eq("id", customerId);

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
  }
}

export async function scanPurgeTargets(): Promise<string[]> {
  const db = getServerClient();
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();

  // Target A: last_visit_at older than retention period and not yet purged
  const { data: staleRows } = await db
    .from("customers")
    .select("id")
    .is("deleted_at", null)
    .lt("last_visit_at", cutoff);

  // Target B: required consent has been withdrawn (revoked_at IS NOT NULL)
  const { data: withdrawnRows } = await db
    .from("consents")
    .select("customer_id")
    .eq("type", "required")
    .not("revoked_at", "is", null);

  const candidateIds = new Set([
    ...(staleRows ?? []).map((r: { id: string }) => r.id),
    ...(withdrawnRows ?? []).map((r: { customer_id: string }) => r.customer_id),
  ]);

  if (candidateIds.size === 0) return [];

  // Final filter: exclude already-anonymized rows
  const { data: alive } = await db
    .from("customers")
    .select("id")
    .in("id", [...candidateIds])
    .is("deleted_at", null);

  return (alive ?? []).map((r: { id: string }) => r.id);
}
