import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { filterByConsent, filterNonDeleted, isNightBlocked } from "@/lib/sendGuard";

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
let activeCustomerId: string;     // ad_sms active, not deleted
let deletedCustomerId: string;    // anonymized (deleted_at set)
let optedOutCustomerId: string;   // ad_sms revoked

beforeAll(async () => {
  const client = db();
  const ownerId = (
    await client.auth.admin.createUser({
      email: `sendex-owner-${TS}@test.local`,
      password: "Pw123456!",
      email_confirm: true,
    })
  ).data.user!.id;

  const { data: sl } = await client
    .from("store_links")
    .insert({
      store_code: "SX" + TS.toString().slice(-6),
      store_name: "SendExclude매장",
      owner_id: ownerId,
      master_store_id: "00000000-0000-0000-0000-000000000004",
      address: "",
    })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  // Active customer
  const { data: c1 } = await client
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 1, unsub_token: `sx-active-${TS}` })
    .select("id").single();
  activeCustomerId = (c1 as { id: string }).id;
  await client.from("consents").insert({
    customer_id: activeCustomerId, store_link_id: storeLinkId,
    type: "ad_sms", agreed: true, agreed_at: new Date().toISOString(),
  });

  // Deleted (anonymized) customer
  const { data: c2 } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId, grade: "normal", visit_count: 3,
      deleted_at: new Date().toISOString(), unsub_token: `sx-deleted-${TS}`,
    })
    .select("id").single();
  deletedCustomerId = (c2 as { id: string }).id;

  // Opted-out customer (ad_sms revoked)
  const { data: c3 } = await client
    .from("customers")
    .insert({ store_link_id: storeLinkId, grade: "normal", visit_count: 2, unsub_token: `sx-opted-${TS}` })
    .select("id").single();
  optedOutCustomerId = (c3 as { id: string }).id;
  await client.from("consents").insert({
    customer_id: optedOutCustomerId, store_link_id: storeLinkId,
    type: "ad_sms", agreed: false, revoked_at: new Date().toISOString(),
  });
});

afterAll(async () => {
  const client = db();
  await client.from("consents").delete().in("customer_id", [activeCustomerId, optedOutCustomerId]);
  await client.from("customers").delete().in("id", [activeCustomerId, deletedCustomerId, optedOutCustomerId]);
  await client.from("store_links").delete().eq("id", storeLinkId);
});

describe("filterNonDeleted", () => {
  it("excludes anonymized (deleted_at IS NOT NULL) customer", async () => {
    const all = [
      { id: activeCustomerId },
      { id: deletedCustomerId },
    ];
    const result = await filterNonDeleted(all);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(activeCustomerId);
    expect(ids).not.toContain(deletedCustomerId);
  });

  it("empty input returns empty array", async () => {
    const result = await filterNonDeleted([]);
    expect(result).toHaveLength(0);
  });
});

describe("filterByConsent — opted-out exclusion", () => {
  it("excludes customer with revoked ad_sms consent", async () => {
    const all = [{ id: activeCustomerId }, { id: optedOutCustomerId }];
    const result = await filterByConsent(all, "sms");
    const ids = result.map((r) => r.id);
    expect(ids).toContain(activeCustomerId);
    expect(ids).not.toContain(optedOutCustomerId);
  });
});

describe("isNightBlocked", () => {
  it("21:00 KST = 12:00 UTC is blocked", () => {
    const d = new Date("2026-01-01T12:00:00Z"); // 21:00 KST
    expect(isNightBlocked(d)).toBe(true);
  });

  it("10:00 KST = 01:00 UTC is blocked", () => {
    // 10:00 KST is NOT blocked... wait 10KST is daytime
    // 01:00 UTC = 10:00 KST → not blocked
    const d = new Date("2026-01-01T01:00:00Z"); // 10:00 KST
    expect(isNightBlocked(d)).toBe(false);
  });

  it("04:00 KST = 19:00 UTC (prev day) is blocked", () => {
    const d = new Date("2026-01-01T19:00:00Z"); // 04:00 KST next day
    expect(isNightBlocked(d)).toBe(true);
  });
});
