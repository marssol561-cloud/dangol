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
const OWNER_EMAIL = `gate-owner-${TS}@test.local`;
const ADMIN_EMAIL = `gate-admin-${TS}@test.local`;
const PASSWORD = "GateTest123!";

let ownerId: string;
let adminUserId: string;

beforeAll(async () => {
  const db = adminClient();

  // Create a regular owner (non-admin)
  const { data: od } = await db.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = od.user!.id;

  // Create a user and add to admins table
  const { data: ad } = await db.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  adminUserId = ad.user!.id;

  await db.from("admins").insert({ id: adminUserId, name: "TestAdmin" });
});

afterAll(async () => {
  const db = adminClient();
  await db.from("admins").delete().eq("id", adminUserId);
  await db.auth.admin.deleteUser(ownerId);
  await db.auth.admin.deleteUser(adminUserId);
});

describe("isAdmin — DB-level gate check", () => {
  it("non-admin owner is NOT in admins table", async () => {
    const db = adminClient();
    const { data } = await db
      .from("admins")
      .select("id")
      .eq("id", ownerId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("admin user IS in admins table", async () => {
    const db = adminClient();
    const { data } = await db
      .from("admins")
      .select("id")
      .eq("id", adminUserId)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect((data as { id: string }).id).toBe(adminUserId);
  });
});

describe("admins table — anon cannot read", () => {
  it("anon gets empty result on admins SELECT", async () => {
    const anon = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, {
      db: { schema: 'dangol' },
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from("admins").select("id").eq("id", adminUserId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
  });

  it("authenticated owner gets empty result on admins SELECT", async () => {
    const ownerDb = createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, {
      db: { schema: 'dangol' },
      auth: { persistSession: false },
    });
    await ownerDb.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
    const { data, error } = await ownerDb.from("admins").select("id").eq("id", adminUserId);
    const denied = error !== null || !data || (data as unknown[]).length === 0;
    expect(denied).toBe(true);
    await ownerDb.auth.signOut();
  });
});
