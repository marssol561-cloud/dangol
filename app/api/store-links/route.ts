import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/auth.server';
import { getServerClient } from '@/lib/dangolDb';

const CHARSET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

function generateStoreCode(): string {
  let code = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) code += CHARSET[b % CHARSET.length];
  return code;
}

async function uniqueStoreCode(db: ReturnType<typeof getServerClient>): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateStoreCode();
    const { data } = await db.from('store_links').select('id').eq('store_code', code).maybeSingle();
    if (!data) return code;
  }
  throw new Error('Failed to generate unique store_code after 10 attempts');
}

export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { master_store_id, store_name, address } = body as {
    master_store_id: string;
    store_name: string;
    address: string;
  };

  if (!master_store_id || !store_name) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
  }

  // service_role client for DB writes (bypasses RLS for cross-table updates)
  const db = getServerClient();

  try {
    const store_code = await uniqueStoreCode(db);

    const { data: link, error: insertErr } = await db
      .from('store_links')
      .insert({
        owner_id: user.id,
        master_store_id,
        store_code,
        store_name,
        address,
      })
      .select('id, store_code')
      .single();

    if (insertErr || !link) {
      console.error('store_links insert:', insertErr);
      return NextResponse.json({ error: '매장 연결 실패' }, { status: 500 });
    }

    const { error: updateErr } = await db
      .from('owners')
      .update({ store_link_id: link.id })
      .eq('id', user.id);

    if (updateErr) {
      console.error('owners update:', updateErr);
      return NextResponse.json({ error: '점주 정보 업데이트 실패' }, { status: 500 });
    }

    return NextResponse.json({ store_code: link.store_code });
  } catch (err) {
    console.error('store-links route error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
