import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { resolveByToken, optOut } from "@/lib/unsubscribe";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function db() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    db: { schema: 'dangol' },
    auth: { persistSession: false },
  });
}

const TS = Date.now();
const TOKEN = `unsub-test-${TS}`;
const BAD_TOKEN = `bad-token-${TS}`;

let storeLinkId: string;
let customerId: string;

beforeAll(async () => {
  const client = db();
  const ownerId = (
    await client.auth.admin.createUser({
      email: `unsub-owner-${TS}@test.local`,
      password: "Pw123456!",
      email_confirm: true,
    })
  ).data.user!.id;

  const { data: sl } = await client
    .from("store_links")
    .insert({
      store_code: "US" + TS.toString().slice(-6),
      store_name: "UnsubTest매장",
      owner_id: ownerId,
      master_store_id: "00000000-0000-0000-0000-000000000001",
      address: "",
    })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;

  const { data: c } = await client
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      grade: "normal",
      visit_count: 0,
      unsub_token: TOKEN,
    })
    .select("id")
    .single();
  customerId = (c as { id: string }).id;

  // Seed ad_sms consent as active
  await client.from("consents").insert({
    customer_id: customerId,
    store_link_id: storeLinkId,
    type: "ad_sms",
    agreed: true,
    agreed_at: new Date().toISOString(),
  });
});

afterAll(async () => {
  const client = db();
  await client.from("consents").delete().eq("customer_id", customerId);
  await client.from("customers").delete().eq("id", customerId);
  await client.from("store_links").delete().eq("id", storeLinkId);
});

describe("resolveByToken", () => {
  it("valid token resolves to correct customer", async () => {
    const result = await resolveByToken(TOKEN);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(customerId);
    expect(result!.store_link_id).toBe(storeLinkId);
  });

  it("bad token returns null", async () => {
    const result = await resolveByToken(BAD_TOKEN);
    expect(result).toBeNull();
  });

  it("empty string returns null", async () => {
    const result = await resolveByToken("");
    expect(result).toBeNull();
  });
});

describe("optOut", () => {
  it("opt-out sets ad_sms consent agreed=false and revoked_at", async () => {
    await optOut(customerId, storeLinkId, "sms");

    const { data } = await db()
      .from("consents")
      .select("agreed, revoked_at")
      .eq("customer_id", customerId)
      .eq("type", "ad_sms")
      .maybeSingle();

    const row = data as { agreed: boolean; revoked_at: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.agreed).toBe(false);
    expect(row!.revoked_at).not.toBeNull();
  });

  it("opt-out inserts row when no prior consent exists", async () => {
    await optOut(customerId, storeLinkId, "email");

    const { data } = await db()
      .from("consents")
      .select("agreed, revoked_at")
      .eq("customer_id", customerId)
      .eq("type", "ad_email")
      .maybeSingle();

    const row = data as { agreed: boolean; revoked_at: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.agreed).toBe(false);
  });
});
