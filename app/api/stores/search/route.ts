import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.server';
import { searchMasterStores } from '@/lib/masterDb';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name') ?? '';
  const address = searchParams.get('address') ?? '';

  try {
    const results = await searchMasterStores(name, address);
    return NextResponse.json(results);
  } catch (err) {
    console.error('Store search error:', err);
    return NextResponse.json({ error: '검색 중 오류가 발생했습니다' }, { status: 500 });
  }
}
