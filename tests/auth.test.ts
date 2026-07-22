import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// service_role client — bypasses RLS for test assertions
function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

// Auth client (anon key — simulates real browser client)
function authClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

const TEST_EMAIL = `test_sp2_${Date.now()}@example.com`;
const TEST_PASSWORD = 'Test1234!';
const TEST_NAME = 'SP2 테스트';

describe('test_signup_creates_owner', () => {
  let createdUserId: string | null = null;

  afterEach(async () => {
    if (createdUserId) {
      const admin = adminClient();
      await admin.auth.admin.deleteUser(createdUserId);
      createdUserId = null;
    }
  });

  it('signUpOwner → owners row exists with correct fields', async () => {
    // Use admin.createUser to bypass email validation (trigger fires identically)
    const admin = adminClient();
    const now = new Date().toISOString();

    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: TEST_NAME,
        terms_agreed_at: now,
        privacy_agreed_at: now,
        marketing_consent: true,
      },
    });

    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    createdUserId = data.user!.id;

    // Wait for trigger to fire
    await new Promise((r) => setTimeout(r, 1000));

    const { data: owner, error: ownerErr } = await admin
      .from('owners')
      .select('*')
      .eq('id', createdUserId)
      .maybeSingle();

    expect(ownerErr).toBeNull();
    expect(owner).toBeTruthy();
    expect(owner!.id).toBe(createdUserId);
    expect(owner!.role).toBe('owner');
    expect(owner!.terms_agreed_at).toBeTruthy();
    expect(owner!.privacy_agreed_at).toBeTruthy();
    expect(owner!.marketing_consent).toBe(true);
  });
});

describe('test_login_succeeds', () => {
  let createdUserId: string | null = null;

  afterEach(async () => {
    if (createdUserId) {
      const admin = adminClient();
      await admin.auth.admin.deleteUser(createdUserId);
      createdUserId = null;
    }
  });

  it('valid credentials → session returned', async () => {
    // Create a test user first
    const admin = adminClient();
    const loginEmail = `login_${Date.now()}@example.com`;
    const { data: created } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    createdUserId = created.user?.id ?? null;

    const client = authClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail,
      password: TEST_PASSWORD,
    });

    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    expect(data.user?.email).toBe(loginEmail);
  });

  it('invalid credentials → error returned', async () => {
    const client = authClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: 'notexist@example.com',
      password: 'WrongPassword!',
    });

    expect(error).toBeTruthy();
    expect(data.user).toBeNull();
  });
});
