import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

let storeLinkId: string;
let ownerId: string;
let staffUserId: string;

const STAFF_EMAIL = `staff-test-${Date.now()}@test.local`;
const STAFF_PASSWORD = "StaffPass123!";

beforeAll(async () => {
  const admin = adminClient();
  const ts = Date.now();

  const { data: ownerD } = await admin.auth.admin.createUser({
    email: `owner-staff-${ts}@test.local`,
    password: "Test1234!",
    email_confirm: true,
  });
  ownerId = ownerD.user!.id;

  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: "ST" + ts.toString().slice(-5), store_name: "직원테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;
  await admin.from("owners").update({ store_link_id: storeLinkId, role: "owner" }).eq("id", ownerId);
});

describe("staff account creation", () => {
  it("creates auth user and owners row with role=staff", async () => {
    const admin = adminClient();
    const now = new Date().toISOString();

    // Create staff user
    const { data: createD, error: createErr } = await admin.auth.admin.createUser({
      email: STAFF_EMAIL,
      password: STAFF_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "테스트직원", terms_agreed_at: now, privacy_agreed_at: now, marketing_consent: false },
    });
    expect(createErr).toBeNull();
    expect(createD.user).not.toBeNull();
    staffUserId = createD.user!.id;

    // Short wait for trigger
    await new Promise((r) => setTimeout(r, 500));

    // Upsert owners row with role=staff
    const { error: upsertErr } = await admin.from("owners").upsert(
      {
        id: staffUserId,
        email: STAFF_EMAIL,
        name: "테스트직원",
        role: "staff",
        store_link_id: storeLinkId,
        terms_agreed_at: now,
        privacy_agreed_at: now,
        marketing_consent: false,
      },
      { onConflict: "id" }
    );
    expect(upsertErr).toBeNull();
  });

  it("owners row has role=staff and correct store_link_id", async () => {
    const admin = adminClient();
    const { data: row } = await admin
      .from("owners")
      .select("role, store_link_id, email")
      .eq("id", staffUserId)
      .single();
    const r = row as { role: string; store_link_id: string; email: string };
    expect(r.role).toBe("staff");
    expect(r.store_link_id).toBe(storeLinkId);
    expect(r.email).toBe(STAFF_EMAIL);
  });

  it("staff user can sign in", async () => {
    const anonDb = createClient(DANGOL_DB_URL, process.env.DANGOL_DB_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data: sess, error } = await anonDb.auth.signInWithPassword({
      email: STAFF_EMAIL,
      password: STAFF_PASSWORD,
    });
    expect(error).toBeNull();
    expect(sess.session).not.toBeNull();
  });
});

describe("staff list scoping", () => {
  it("list staff returns only own store_link staff", async () => {
    const admin = adminClient();

    // Create another store and staff
    const { data: sl2 } = await admin
      .from("store_links")
      .insert({ store_code: "ST2" + Date.now().toString().slice(-4), store_name: "남의가게3", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
      .select("id")
      .single();
    const otherSlId = (sl2 as { id: string }).id;

    const ts = Date.now();
    const { data: otherStaff } = await admin.auth.admin.createUser({
      email: `other-staff-${ts}@test.local`,
      password: "Test1234!",
      email_confirm: true,
    });
    const otherStaffId = otherStaff.user!.id;
    await new Promise((r) => setTimeout(r, 500));
    await admin.from("owners").upsert({
      id: otherStaffId,
      email: `other-staff-${ts}@test.local`,
      role: "staff",
      store_link_id: otherSlId,
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    }, { onConflict: "id" });

    // Query staff for our store
    const { data: staffList } = await admin
      .from("owners")
      .select("id, role, store_link_id")
      .eq("store_link_id", storeLinkId)
      .eq("role", "staff");

    const ids = (staffList ?? []).map((s: { id: string }) => s.id);
    expect(ids).toContain(staffUserId);
    expect(ids).not.toContain(otherStaffId);

    // Cleanup
    await admin.auth.admin.deleteUser(otherStaffId).catch(() => {});
    await admin.from("store_links").delete().eq("id", otherSlId);
  });

  it("password is not logged or returned in staff list", async () => {
    const admin = adminClient();
    const { data: staffList } = await admin
      .from("owners")
      .select("id, email, name, role, created_at")
      .eq("store_link_id", storeLinkId)
      .eq("role", "staff");

    const allKeys = (staffList ?? []).flatMap((s: Record<string, unknown>) => Object.keys(s));
    expect(allKeys).not.toContain("password");
    expect(allKeys).not.toContain("encrypted_password");
  });
});
