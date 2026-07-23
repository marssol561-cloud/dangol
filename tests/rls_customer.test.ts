import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { hashPII, encryptPII } from "@/lib/crypto";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

function anonClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

function authedClient(accessToken: string) {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
}

async function createOwnerWithLink(tag: string) {
  const admin = adminClient();
  const email = `rls_cust_${tag}_${Date.now()}@example.com`;
  const pass = "Test1234!";

  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    user_metadata: {
      name: tag,
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  await new Promise((r) => setTimeout(r, 1000));
  const userId = u.user!.id;

  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({
      owner_id: userId,
      master_store_id: crypto.randomUUID(),
      store_code: code,
      store_name: `${tag}매장`,
      address: "서울",
    })
    .select("id")
    .single();

  const storeLinkId = (link as { id: string }).id;

  // Create a customer for this store
  const hash = hashPII(`010${tag.slice(-4)}0000`, "phone");
  const enc = encryptPII(`010${tag.slice(-4)}0000`);
  const { data: cust } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: hash,
      phone_enc: enc,
      visit_purpose: "혼밥",
      grade: "normal",
      visit_count: 0,
      browser_token: `bt_${tag}`,
      unsub_token: crypto.randomUUID(),
    })
    .select("id")
    .single();

  return { userId, pass, email, storeLinkId, customerId: (cust as { id: string }).id };
}

describe("test_rls_customer", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    const admin = adminClient();
    for (const id of userIds.splice(0)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("anon SELECT customers → denied (empty result)", async () => {
    const { userId: uid } = await createOwnerWithLink("anon");
    userIds.push(uid);

    const anon = anonClient();
    const { data, error } = await anon.from("customers").select("id").limit(10);

    // RLS with no anon policy returns empty rows (not an error, just no results)
    const rows = (data ?? []) as { id: string }[];
    expect(error).toBeNull();
    expect(rows.length).toBe(0);
  });

  it("owner A sees only own store customers, not owner B's", async () => {
    const ownerA = await createOwnerWithLink("ownerA");
    const ownerB = await createOwnerWithLink("ownerB");
    userIds.push(ownerA.userId, ownerB.userId);

    // Sign in as owner A
    const authA = anonClient();
    const { data: sessionA } = await authA.auth.signInWithPassword({
      email: ownerA.email,
      password: ownerA.pass,
    });
    const tokenA = sessionA.session!.access_token;
    const clientA = authedClient(tokenA);

    // Owner A sees their own customer
    const { data: rowsA } = await clientA.from("customers").select("id, store_link_id");
    const aIds = (rowsA ?? []) as { id: string; store_link_id: string }[];
    expect(aIds.some((r) => r.id === ownerA.customerId)).toBe(true);
    // Owner A does NOT see owner B's customer
    expect(aIds.some((r) => r.id === ownerB.customerId)).toBe(false);
  });
});
