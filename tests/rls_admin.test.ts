import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;
const DANGOL_DB_ANON_KEY = process.env.DANGOL_DB_ANON_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    db: { schema: 'dangol' },
    auth: { persistSession: false },
  });
}

const TS = Date.now();
const OWNER_EMAIL = `rls-admin-owner-${TS}@test.local`;
const OWNER_PASSWORD = "RlsAdminTest123!";

let ownerId: string;
let adminUserId: string;
let uniId: string;
let auditId: string;

beforeAll(async () => {
  const db = adminClient();

  // Create owner (non-admin)
  const { data: od } = await db.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  ownerId = od.user!.id;

  // Create admin user
  const { data: ad } = await db.auth.admin.createUser({
    email: `rls-admin-admin-${TS}@test.local`,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  adminUserId = ad.user!.id;
  await db.from("admins").insert({ id: adminUserId, name: "RlsTestAdmin" });

  // Seed unified_customers and audit_logs for RLS test
  const { data: uni } = await db
    .from("unified_customers")
    .insert({ identifier_hash: `rls-test-hash-${TS}`, store_count: 1 })
    .select("id")
    .single();
  uniId = (uni as { id: string }).id;

  const { data: al } = await db
    .from("audit_logs")
    .insert({ admin_user: adminUserId, action: "rls_test", target: "test", count: 0 })
    .select("id")
    .single();
  auditId = (al as { id: string }).id;
});

afterAll(async () => {
  const db = adminClient();
  await db.from("audit_logs").delete().eq("id", auditId);
  await db.from("unified_customers").delete().eq("id", uniId);
  await db.from("admins").delete().eq("id", adminUserId);
  await db.auth.admin.deleteUser(ownerId);
  await db.auth.admin.deleteUser(adminUserId);
});

describe("RLS — admins table", () => {
  it("anon cannot SELECT from admins", async () => {
    const anon = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    const { data, error } = await anon.from("admins").select("id").eq("id", adminUserId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("owner (authenticated, not admin) cannot SELECT from admins", async () => {
    const ownerDb = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    await ownerDb.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
    const { data, error } = await ownerDb.from("admins").select("id").eq("id", adminUserId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
    await ownerDb.auth.signOut();
  });
});

describe("RLS — unified_customers table", () => {
  it("anon cannot SELECT from unified_customers", async () => {
    const anon = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    const { data, error } = await anon.from("unified_customers").select("id").eq("id", uniId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("owner (authenticated) cannot SELECT from unified_customers", async () => {
    const ownerDb = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    await ownerDb.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
    const { data, error } = await ownerDb.from("unified_customers").select("id").eq("id", uniId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
    await ownerDb.auth.signOut();
  });
});

describe("RLS — audit_logs table", () => {
  it("anon cannot SELECT from audit_logs", async () => {
    const anon = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    const { data, error } = await anon.from("audit_logs").select("id").eq("id", auditId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("owner (authenticated) cannot SELECT from audit_logs", async () => {
    const ownerDb = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, { db: { schema: 'dangol' }, auth: { persistSession: false } });
    await ownerDb.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
    const { data, error } = await ownerDb.from("audit_logs").select("id").eq("id", auditId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
    await ownerDb.auth.signOut();
  });

  it("service_role CAN SELECT from all three tables", async () => {
    const db = adminClient();
    const [{ data: a }, { data: u }, { data: al }] = await Promise.all([
      db.from("admins").select("id").eq("id", adminUserId).maybeSingle(),
      db.from("unified_customers").select("id").eq("id", uniId).maybeSingle(),
      db.from("audit_logs").select("id").eq("id", auditId).maybeSingle(),
    ]);
    expect(a).not.toBeNull();
    expect(u).not.toBeNull();
    expect(al).not.toBeNull();
  });
});
