import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/auth.server';
import { getServerClient } from '@/lib/dangolDb';

export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { requested_store_name, requested_address } = body as {
    requested_store_name: string;
    requested_address: string;
  };

  if (!requested_store_name) {
    return NextResponse.json({ error: '매장명은 필수입니다' }, { status: 400 });
  }

  const db = getServerClient();
  const { error } = await db.from('store_requests').insert({
    owner_id: user.id,
    requested_store_name,
    requested_address: requested_address ?? '',
    status: 'pending',
  });

  if (error) {
    console.error('store_requests insert:', error);
    return NextResponse.json({ error: '등록 요청 실패' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
