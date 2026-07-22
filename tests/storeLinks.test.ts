import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

async function createTestUser(email: string, password: string) {
  const admin = adminClient();
  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: 'Test Owner',
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  // Wait for trigger
  await new Promise((r) => setTimeout(r, 1000));
  return data.user!;
}

describe('test_store_link_create', () => {
  const testEmail = `storelink_${Date.now()}@example.com`;
  const testPassword = 'Test1234!';
  let userId: string;

  afterEach(async () => {
    if (userId) {
      const admin = adminClient();
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('store_links row created, unique store_code, owners.store_link_id updated', async () => {
    const user = await createTestUser(testEmail, testPassword);
    userId = user.id;

    const admin = adminClient();

    // Simulate POST /api/store-links logic directly via DB
    const CHARSET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
    let code = '';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) code += CHARSET[b % CHARSET.length];

    const fakeStoreId = crypto.randomUUID();
    const { data: link, error: insertErr } = await admin
      .from('store_links')
      .insert({
        owner_id: userId,
        master_store_id: fakeStoreId,
        store_code: code,
        store_name: '테스트 매장',
        address: '서울시 테스트구',
      })
      .select('id, store_code')
      .single();

    expect(insertErr).toBeNull();
    expect(link).toBeTruthy();
    expect(link!.store_code).toBe(code);
    expect(link!.store_code).toHaveLength(8);

    // Update owners.store_link_id
    const { error: updateErr } = await admin
      .from('owners')
      .update({ store_link_id: link!.id })
      .eq('id', userId);

    expect(updateErr).toBeNull();

    // Verify owners.store_link_id is set
    const { data: owner } = await admin
      .from('owners')
      .select('store_link_id')
      .eq('id', userId)
      .maybeSingle();

    expect(owner?.store_link_id).toBe(link!.id);
  });

  it('store_code is unique across rows', async () => {
    const user = await createTestUser(
      `storelink2_${Date.now()}@example.com`,
      testPassword
    );
    const uid2 = user.id;

    const admin = adminClient();
    const code1 = 'TESTCODE';

    await admin.from('store_links').insert({
      owner_id: uid2,
      master_store_id: crypto.randomUUID(),
      store_code: code1,
      store_name: '매장1',
      address: '',
    });

    // Second insert with same code must fail
    const { error } = await admin.from('store_links').insert({
      owner_id: uid2,
      master_store_id: crypto.randomUUID(),
      store_code: code1,
      store_name: '매장2',
      address: '',
    });

    expect(error).toBeTruthy(); // unique constraint violation

    await admin.auth.admin.deleteUser(uid2);
  });
});
