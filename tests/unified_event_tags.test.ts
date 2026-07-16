import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getUnifiedTagMap, getUnifiedIdsByTag, listDistinctTags } from "@/lib/events";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const TS = Date.now();
const TAG_BIRTHDAY = `생일-${TS}`;
const TAG_COUPLE = `커플-${TS}`;
const TAG_UNLINKED = `군인동반-${TS}`;

let store1Id: string;
let store2Id: string;
let ownerId: string;
let uni1Id: string;
let uni2Id: string;
let custA: string; // store1, unified -> uni1
let custB: string; // store2, unified -> uni1 (same person, 2nd store)
let custC: string; // store1, unified = null (unlinked — must never surface)
// store1, unified -> uni2 (separate person — must not see uni1's tags); captured via uni2Id in assertions below
const customerIds: string[] = [];
const tagIds: string[] = [];

async function makeCustomer(admin: SupabaseClient, storeLinkId: string, unifiedId: string | null): Promise<string> {
  const { data } = await admin
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 0, unsub_token: crypto.randomUUID(), unified_id: unifiedId })
    .select("id")
    .single();
  const id = (data as { id: string }).id;
  customerIds.push(id);
  return id;
}

beforeAll(async () => {
  const admin = adminClient();

  const { data: od } = await admin.auth.admin.createUser({
    email: `uet-owner-${TS}@test.local`,
    password: "Pw123456!",
    email_confirm: true,
  });
  ownerId = od.user!.id;

  const { data: sl1 } = await admin
    .from("store_links")
    .insert({ store_code: "UET1" + TS.toString().slice(-5), store_name: "통합태그테스트1", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  store1Id = (sl1 as { id: string }).id;

  const { data: sl2 } = await admin
    .from("store_links")
    .insert({ store_code: "UET2" + TS.toString().slice(-5), store_name: "통합태그테스트2", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  store2Id = (sl2 as { id: string }).id;

  const { data: u1 } = await admin
    .from("unified_customers")
    .insert({ identifier_hash: `uethash1-${TS}`, store_count: 2 })
    .select("id")
    .single();
  uni1Id = (u1 as { id: string }).id;

  const { data: u2 } = await admin
    .from("unified_customers")
    .insert({ identifier_hash: `uethash2-${TS}`, store_count: 1 })
    .select("id")
    .single();
  uni2Id = (u2 as { id: string }).id;

  custA = await makeCustomer(admin, store1Id, uni1Id);
  custB = await makeCustomer(admin, store2Id, uni1Id);
  custC = await makeCustomer(admin, store1Id, null);
  await makeCustomer(admin, store1Id, uni2Id);

  const { data: t1 } = await admin
    .from("customer_tags")
    .insert({ customer_id: custA, store_link_id: store1Id, tag: TAG_BIRTHDAY })
    .select("id")
    .single();
  const { data: t2 } = await admin
    .from("customer_tags")
    .insert({ customer_id: custA, store_link_id: store1Id, tag: TAG_BIRTHDAY }) // duplicate — must dedupe
    .select("id")
    .single();
  const { data: t3 } = await admin
    .from("customer_tags")
    .insert({ customer_id: custB, store_link_id: store2Id, tag: TAG_COUPLE })
    .select("id")
    .single();
  const { data: t4 } = await admin
    .from("customer_tags")
    .insert({ customer_id: custC, store_link_id: store1Id, tag: TAG_UNLINKED })
    .select("id")
    .single();
  tagIds.push(
    (t1 as { id: string }).id,
    (t2 as { id: string }).id,
    (t3 as { id: string }).id,
    (t4 as { id: string }).id
  );
});

afterAll(async () => {
  const admin = adminClient();
  if (tagIds.length) await admin.from("customer_tags").delete().in("id", tagIds);
  if (customerIds.length) await admin.from("customers").delete().in("id", customerIds);
  await admin.from("unified_customers").delete().in("id", [uni1Id, uni2Id]);
  await admin.from("store_links").delete().in("id", [store1Id, store2Id]);
  await admin.auth.admin.deleteUser(ownerId);
});

describe("getUnifiedTagMap", () => {
  it("rolls up DISTINCT tags across a unified customer's linked stores", async () => {
    const admin = adminClient();
    const map = await getUnifiedTagMap(admin, [uni1Id, uni2Id]);
    expect(map[uni1Id].sort()).toEqual([TAG_BIRTHDAY, TAG_COUPLE].sort());
  });

  it("dedupes a tag inserted twice for the same unified customer", async () => {
    const admin = adminClient();
    const map = await getUnifiedTagMap(admin, [uni1Id]);
    expect(map[uni1Id].filter((t) => t === TAG_BIRTHDAY).length).toBe(1);
  });

  it("unlinked customer's tags never surface under any unified id", async () => {
    const admin = adminClient();
    const map = await getUnifiedTagMap(admin, [uni1Id, uni2Id]);
    const allTags = [...map[uni1Id], ...map[uni2Id]];
    expect(allTags).not.toContain(TAG_UNLINKED);
  });

  it("unified id with no tags returns an empty array", async () => {
    const admin = adminClient();
    const map = await getUnifiedTagMap(admin, [uni2Id]);
    expect(map[uni2Id]).toEqual([]);
  });

  it("empty unifiedIds input returns empty map", async () => {
    const admin = adminClient();
    const map = await getUnifiedTagMap(admin, []);
    expect(map).toEqual({});
  });
});

describe("getUnifiedIdsByTag", () => {
  it("returns the unified id holding a matching tag", async () => {
    const admin = adminClient();
    const ids = await getUnifiedIdsByTag(admin, TAG_BIRTHDAY);
    expect(ids).toContain(uni1Id);
    expect(ids).not.toContain(uni2Id);
  });

  it("excludes unified ids reachable only via an unlinked customer", async () => {
    const admin = adminClient();
    const ids = await getUnifiedIdsByTag(admin, TAG_UNLINKED);
    expect(ids).toEqual([]);
  });

  it("unknown tag returns empty array", async () => {
    const admin = adminClient();
    const ids = await getUnifiedIdsByTag(admin, `no-such-tag-${TS}`);
    expect(ids).toEqual([]);
  });
});

describe("listDistinctTags", () => {
  it("includes every distinct tag inserted, without duplicates", async () => {
    const admin = adminClient();
    const tags = await listDistinctTags(admin);
    expect(tags).toEqual(expect.arrayContaining([TAG_BIRTHDAY, TAG_COUPLE, TAG_UNLINKED]));
    expect(new Set(tags).size).toBe(tags.length);
  });
});
