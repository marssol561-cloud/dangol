import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

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

const cleanupIds: string[] = [];

async function createTestUserAndStoreLink(emailPrefix: string) {
  const admin = adminClient();
  const email = `${emailPrefix}_${Date.now()}@example.com`;
  const password = 'Test1234!';

  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: 'RLS Test Owner',
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  const userId = data.user!.id;
  cleanupIds.push(userId);
  await new Promise((r) => setTimeout(r, 800));

  const code = `RL${emailPrefix.slice(0, 4).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data: link } = await admin
    .from('store_links')
    .insert({
      owner_id: userId,
      master_store_id: crypto.randomUUID(),
      store_code: code,
      store_name: `RLS Test ${emailPrefix}`,
      address: '',
    })
    .select('id, store_code')
    .single();

  return { userId, email, password, storeLink: link! };
}

afterAll(async () => {
  const admin = adminClient();
  for (const id of cleanupIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe('test_rls_owner_isolation', () => {
  it('owner A cannot read owner B store_links', async () => {
    const ownerA = await createTestUserAndStoreLink('ownerA');
    const ownerB = await createTestUserAndStoreLink('ownerB');

    // Sign in as owner A
    const clientA = createClient(
      process.env.DANGOL_DB_URL!,
      process.env.DANGOL_DB_ANON_KEY!,
      { db: { schema: 'dangol' }, auth: { persistSession: false } }
    );
    await clientA.auth.signInWithPassword({
      email: ownerA.email,
      password: 'Test1234!',
    });

    // Try to read owner B's store_links
    const { data, error } = await clientA
      .from('store_links')
      .select('*')
      .eq('owner_id', ownerB.userId);

    // RLS must deny: either error or empty array
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it('anon client cannot read store_links', async () => {
    const client = anonClient();
    const { data, error } = await client.from('store_links').select('*');

    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it('anon client cannot read owners', async () => {
    const client = anonClient();
    const { data, error } = await client.from('owners').select('*');

    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data).toHaveLength(0);
    }
  });
});
