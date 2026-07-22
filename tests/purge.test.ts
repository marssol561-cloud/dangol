import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { anonymizeCustomer, scanPurgeTargets, RETENTION_MS } from "@/lib/purge";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function db() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    db: { schema: 'dangol' },
    auth: { persistSession: false },
  });
}

const TS = Date.now();

let storeLinkId: string;
let staleCustomerId: string;     // last_visit_at = 3 years ago → purge target
let freshCustomerId: string;     // recent visit → NOT a target
let withdrawnCustomerId: string; // required consent revoked → purge target
let unifiedId: string;

beforeAll(async () => {
  const client = db();
  const ownerId = (
    await client.auth.admin.createUser({
      email: `purge-owner-${TS}@test.local`,
      password: "Pw123456!",
      email_confirm: true,
    })
  ).data.user!.id;

  const { data: sl } = await client
    .from("store_links")
    .insert({
      store_code: "PG" + TS.toString().slice(-6),
      store_name: "PurgeTest매장",
      owner_id: ownerId,
      master_store_id: "00000000-0000-0000-0000-000000000002",
      address: "",
    })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  // Stale customer: last_visit_at 3 years ago
  const staleVisit = new Date(Date.now() - RETENTION_MS - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: c1 } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 5,
      last_visit_at: staleVisit,
      unsub_token: `purge-stale-${TS}`,
    })
    .select("id")
    .single();
  staleCustomerId = (c1 as { id: string }).id;

  // Create unified row and link stale customer
  const { data: uni } = await client
    .from("unified_customers")
    .insert({ identifier_hash: `purge-hash-${TS}`, store_count: 1 })
    .select("id")
    .single();
  unifiedId = (uni as { id: string }).id;
  await client.from("customers").update({ unified_id: unifiedId }).eq("id", staleCustomerId);

  // Fresh customer: visited yesterday
  const freshVisit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: c2 } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 2,
      last_visit_at: freshVisit,
      unsub_token: `purge-fresh-${TS}`,
    })
    .select("id")
    .single();
  freshCustomerId = (c2 as { id: string }).id;

  // Withdrawn customer: required consent revoked
  const { data: c3 } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 1,
      last_visit_at: new Date().toISOString(),
      unsub_token: `purge-withdrawn-${TS}`,
    })
    .select("id")
    .single();
  withdrawnCustomerId = (c3 as { id: string }).id;

  await client.from("consents").insert({
    customer_id: withdrawnCustomerId,
    store_link_id: storeLinkId,
    type: "required",
    agreed: false,
    revoked_at: new Date().toISOString(),
  });
});

afterAll(async () => {
  const client = db();
  await client.from("consents").delete().eq("customer_id", withdrawnCustomerId);
  await client.from("customers").delete().in("id", [staleCustomerId, freshCustomerId, withdrawnCustomerId]);
  await client.from("unified_customers").delete().eq("id", unifiedId).maybeSingle();
  await client.from("store_links").delete().eq("id", storeLinkId);
});

describe("scanPurgeTargets", () => {
  it("finds stale (2y+ no-visit) customer", async () => {
    const targets = await scanPurgeTargets();
    expect(targets).toContain(staleCustomerId);
  });

  it("finds required-consent-withdrawn customer", async () => {
    const targets = await scanPurgeTargets();
    expect(targets).toContain(withdrawnCustomerId);
  });

  it("does NOT include fresh customer", async () => {
    const targets = await scanPurgeTargets();
    expect(targets).not.toContain(freshCustomerId);
  });
});

describe("anonymizeCustomer", () => {
  it("nulls contact fields, sets deleted_at, keeps visit_count, detaches unified", async () => {
    // Seed contact data
    const client = db();
    await client.from("customers").update({
      phone_enc: "enc-placeholder",
      phone_hash: "hash-placeholder",
      name: "테스트고객",
      memo: "메모",
    }).eq("id", staleCustomerId);

    await anonymizeCustomer(staleCustomerId);

    const { data } = await client
      .from("customers")
      .select("phone_enc, phone_hash, name, memo, deleted_at, visit_count, unified_id")
      .eq("id", staleCustomerId)
      .single();

    const row = data as {
      phone_enc: string | null;
      phone_hash: string | null;
      name: string | null;
      memo: string | null;
      deleted_at: string | null;
      visit_count: number;
      unified_id: string | null;
    };

    expect(row.phone_enc).toBeNull();
    expect(row.phone_hash).toBeNull();
    expect(row.name).toBeNull();
    expect(row.memo).toBeNull();
    expect(row.deleted_at).not.toBeNull();
    expect(row.visit_count).toBe(5); // stats preserved
    expect(row.unified_id).toBeNull();
  });

  it("deletes unified_customers row when store_count reaches 0", async () => {
    const { data: uni } = await db()
      .from("unified_customers")
      .select("id")
      .eq("id", unifiedId)
      .maybeSingle();
    // store_count was 1 before purge → should be deleted now
    expect(uni).toBeNull();
  });

  it("scanPurgeTargets excludes already-anonymized customer", async () => {
    const targets = await scanPurgeTargets();
    expect(targets).not.toContain(staleCustomerId);
  });
});
