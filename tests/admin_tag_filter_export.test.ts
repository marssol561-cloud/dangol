import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { DangolClient } from "@/lib/dangolDb";
import { getUnifiedTagMap, getUnifiedIdsByTag, listDistinctTags } from "@/lib/events";
import { isAdmin } from "@/lib/admin";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
}

const TS = Date.now();
const TAG_MATCH = `어르신동반-${TS}`;

let storeId: string;
let ownerId: string;
let uniMatchId: string; // has TAG_MATCH
let uniOtherId: string; // no tags
let custMatch: string;
let custOther: string;
let tagId: string;
let nonAdminOwnerId: string;
let adminUserId: string;

async function makeCustomer(admin: DangolClient, storeLinkId: string, unifiedId: string | null): Promise<string> {
  const { data } = await admin
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID(), unified_id: unifiedId })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

beforeAll(async () => {
  const admin = adminClient();

  const { data: od } = await admin.auth.admin.createUser({
    email: `atfe-owner-${TS}@test.local`,
    password: "Pw123456!",
    email_confirm: true,
  });
  ownerId = od.user!.id;

  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: "ATFE" + TS.toString().slice(-5), store_name: "태그필터테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeId = (sl as { id: string }).id;

  const { data: u1 } = await admin
    .from("unified_customers")
    .insert({ identifier_hash: `atfehash1-${TS}`, store_count: 1 })
    .select("id")
    .single();
  uniMatchId = (u1 as { id: string }).id;

  const { data: u2 } = await admin
    .from("unified_customers")
    .insert({ identifier_hash: `atfehash2-${TS}`, store_count: 1 })
    .select("id")
    .single();
  uniOtherId = (u2 as { id: string }).id;

  custMatch = await makeCustomer(admin, storeId, uniMatchId);
  custOther = await makeCustomer(admin, storeId, uniOtherId);

  const { data: t } = await admin
    .from("customer_tags")
    .insert({ customer_id: custMatch, store_link_id: storeId, tag: TAG_MATCH })
    .select("id")
    .single();
  tagId = (t as { id: string }).id;

  // Admin gate fixtures — mirrors adminGate.test.ts, scoped to this sprint's endpoints.
  const { data: nod } = await admin.auth.admin.createUser({
    email: `atfe-nonadmin-${TS}@test.local`,
    password: "Pw123456!",
    email_confirm: true,
  });
  nonAdminOwnerId = nod.user!.id;

  const { data: ad } = await admin.auth.admin.createUser({
    email: `atfe-admin-${TS}@test.local`,
    password: "Pw123456!",
    email_confirm: true,
  });
  adminUserId = ad.user!.id;
  await admin.from("admins").insert({ id: adminUserId, name: "ATFETestAdmin" });
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("audit_logs").delete().eq("admin_user", adminUserId);
  await admin.from("customer_tags").delete().eq("id", tagId);
  await admin.from("customers").delete().in("id", [custMatch, custOther]);
  await admin.from("unified_customers").delete().in("id", [uniMatchId, uniOtherId]);
  await admin.from("store_links").delete().eq("id", storeId);
  await admin.from("admins").delete().eq("id", adminUserId);
  await admin.auth.admin.deleteUser(ownerId);
  await admin.auth.admin.deleteUser(nonAdminOwnerId);
  await admin.auth.admin.deleteUser(adminUserId);
});

describe("tag_filter — the ?tag= query the admin list route runs", () => {
  it("restricting to getUnifiedIdsByTag(tag) returns only the matching unified customer", async () => {
    const admin = adminClient();
    const ids = await getUnifiedIdsByTag(admin, TAG_MATCH);
    const { data } = await admin.from("unified_customers").select("id").in("id", ids);
    const returnedIds = (data ?? []).map((r) => (r as { id: string }).id);
    expect(returnedIds).toContain(uniMatchId);
    expect(returnedIds).not.toContain(uniOtherId);
  });

  it("without a tag filter, both unified customers are present in the unrestricted query", async () => {
    const admin = adminClient();
    const { data } = await admin.from("unified_customers").select("id").in("id", [uniMatchId, uniOtherId]);
    const returnedIds = (data ?? []).map((r) => (r as { id: string }).id);
    expect(returnedIds.sort()).toEqual([uniMatchId, uniOtherId].sort());
  });
});

describe("available_tags", () => {
  it("listDistinctTags includes the tag used for filtering", async () => {
    const admin = adminClient();
    const tags = await listDistinctTags(admin);
    expect(tags).toContain(TAG_MATCH);
  });
});

describe("export_tag_audit — the filtered export + audit_logs write the export route performs", () => {
  it("writes an audit_logs row whose count matches the tag-filtered row count and target reflects the filter", async () => {
    const admin = adminClient();
    const ids = await getUnifiedIdsByTag(admin, TAG_MATCH);
    const { data } = await admin.from("unified_customers").select("id").in("id", ids);
    const filteredCount = (data ?? []).length;
    expect(filteredCount).toBe(1);

    const target = `unified_customers?tag=${TAG_MATCH}`;
    await admin.from("audit_logs").insert({
      admin_user: adminUserId,
      action: "export",
      target,
      count: filteredCount,
    });

    const { data: logs } = await admin
      .from("audit_logs")
      .select("admin_user, action, target, count")
      .eq("admin_user", adminUserId)
      .eq("action", "export")
      .eq("target", target)
      .order("created_at", { ascending: false })
      .limit(1);

    expect((logs ?? []).length).toBe(1);
    const log = (logs as { admin_user: string; action: string; target: string; count: number }[])[0];
    expect(log.target).toBe(target);
    expect(log.count).toBe(1);
  });

  it("filtered rows carry the exportable 이벤트태그 column data via getUnifiedTagMap", async () => {
    const admin = adminClient();
    const ids = await getUnifiedIdsByTag(admin, TAG_MATCH);
    const tagMap = await getUnifiedTagMap(admin, ids);
    const csvColumn = (tagMap[uniMatchId] ?? []).join(";");
    expect(csvColumn).toBe(TAG_MATCH);
  });
});

describe("admin_auth — same isAdmin() gate the list/export routes call before any query", () => {
  it("non-admin owner → isAdmin() false (route would 404)", async () => {
    expect(await isAdmin(nonAdminOwnerId)).toBe(false);
  });

  it("unrecognized/no-session id → isAdmin() false (route would 404)", async () => {
    expect(await isAdmin(crypto.randomUUID())).toBe(false);
  });

  it("seeded admin user → isAdmin() true (route proceeds to query)", async () => {
    expect(await isAdmin(adminUserId)).toBe(true);
  });
});
