import { getServerClient } from "@/lib/dangolDb";

interface Consents {
  thirdparty: boolean;
  [key: string]: boolean;
}

export async function linkUnifiedIfConsented(
  customerId: string,
  identifierHash: string,
  storeLinkId: string,
  consents: Consents
): Promise<void> {
  if (!consents.thirdparty) return;

  const db = getServerClient();

  const { data: existing } = await db
    .from("unified_customers")
    .select("id, store_count")
    .eq("identifier_hash", identifierHash)
    .maybeSingle();

  let uniId: string;

  if (existing) {
    const row = existing as { id: string; store_count: number };
    uniId = row.id;

    // Increment store_count only if this store hasn't linked to this unified row yet
    const { count } = await db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("unified_id", uniId)
      .eq("store_link_id", storeLinkId);

    const isNewStore = !count || count === 0;
    if (isNewStore) {
      await db
        .from("unified_customers")
        .update({ store_count: row.store_count + 1 })
        .eq("id", uniId);
    }
  } else {
    const { data: created } = await db
      .from("unified_customers")
      .insert({ identifier_hash: identifierHash, store_count: 1 })
      .select("id")
      .single();
    uniId = (created as { id: string }).id;
  }

  await db.from("customers").update({ unified_id: uniId }).eq("id", customerId);
}
