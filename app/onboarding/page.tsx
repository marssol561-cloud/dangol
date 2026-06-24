'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserSupabase } from '@/lib/auth';
import AppHeader from '@/app/components/AppHeader';
import Card from '@/app/components/ui/Card';
import FormField from '@/app/components/ui/FormField';
import Input from '@/app/components/ui/Input';
import PrimaryButton from '@/app/components/ui/PrimaryButton';

type MasterStore = { store_id: string; store_name: string; address: string };
type Step = 'connect' | 'qr' | 'done';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('connect');
  const [searchName, setSearchName] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [results, setResults] = useState<MasterStore[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestAddress, setRequestAddress] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkOwner() {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: owner } = await supabase
        .from('owners')
        .select('store_link_id')
        .eq('id', user.id)
        .maybeSingle();
      if (owner?.store_link_id) setStep('qr');
    }
    checkOwner();
  }, [router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSearching(true);
    setSearched(false);
    try {
      const params = new URLSearchParams({ name: searchName, address: searchAddress });
      const res = await fetch(`/api/stores/search?${params}`);
      if (!res.ok) throw new Error('검색 실패');
      const data: MasterStore[] = await res.json();
      setResults(data);
      setSearched(true);
    } catch {
      setError('매장 검색 중 오류가 발생했습니다');
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectStore(store: MasterStore) {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/store-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_store_id: store.store_id,
          store_name: store.store_name,
          address: store.address,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? '매장 연결 실패');
      }
      const { store_code } = await res.json();
      setStoreCode(store_code);
      setStoreName(store.store_name);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  async function handleStoreRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/store-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_store_name: requestName,
          requested_address: requestAddress,
        }),
      });
      if (!res.ok) throw new Error('요청 실패');
      setRequestSent(true);
    } catch {
      setError('요청 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  async function handleQrDownload() {
    let code = storeCode;
    if (!code) {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: owner } = await supabase
          .from('owners')
          .select('store_link_id')
          .eq('id', user.id)
          .maybeSingle();
        if (owner?.store_link_id) {
          const { data: link } = await supabase
            .from('store_links')
            .select('store_code, store_name')
            .eq('id', owner.store_link_id)
            .maybeSingle();
          code = link?.store_code ?? '';
          if (link?.store_name) setStoreName(link.store_name);
        }
      }
      setStoreCode(code);
    }
    if (!code) return;
    window.open(`/api/qr?code=${code}`, '_blank');
  }

  const btnOutlineStyle = { border: '1px solid #e5e5e0', color: '#5f5e5a', fontWeight: 600, fontSize: 14, borderRadius: 8, padding: '14px 20px', width: '100%', cursor: 'pointer', background: '#fff', boxSizing: 'border-box' as const };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="auth" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        {step === 'connect' ? (
          <Card style={{ maxWidth: 520 }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>매장 연결</p>
              <p style={{ fontSize: 14, color: '#5f5e5a', marginTop: 6 }}>운영하시는 매장을 검색해 주세요</p>
            </div>

            <form onSubmit={handleSearch} className="contents">
              <FormField label="매장명">
                <Input
                  type="text"
                  placeholder="매장명"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </FormField>
              <FormField label="주소">
                <Input
                  type="text"
                  placeholder="주소"
                  value={searchAddress}
                  onChange={(e) => setSearchAddress(e.target.value)}
                />
              </FormField>
              <PrimaryButton type="submit" disabled={searching}>
                {searching ? '검색 중...' : '검색'}
              </PrimaryButton>
            </form>

            {error && <p className="text-[#d32f2f] text-xs">{error}</p>}

            {searched && results.length === 0 && (
              <div style={{ padding: 16, background: '#f8f7f4', border: '1px solid #e5e5e0', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>등록된 매장이 없습니다.</p>
                {!requestSent ? (
                  <form onSubmit={handleStoreRequest} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p className="text-xs text-[#888780]">잇다랩에 매장 등록을 요청할 수 있습니다:</p>
                    <Input
                      type="text"
                      placeholder="매장명 *"
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      required
                    />
                    <Input
                      type="text"
                      placeholder="주소"
                      value={requestAddress}
                      onChange={(e) => setRequestAddress(e.target.value)}
                    />
                    <button type="submit" disabled={loading} style={btnOutlineStyle}>
                      {loading ? '요청 중...' : '잇다랩에 매장 등록 요청'}
                    </button>
                  </form>
                ) : (
                  <p className="text-[#0f6e56] text-sm">
                    ✓ 매장 등록 요청이 접수되었습니다. 검토 후 연락드리겠습니다.
                  </p>
                )}
              </div>
            )}

            {results.length > 0 && (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
                {results.map((s) => (
                  <li
                    key={s.store_id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, border: '1px solid #e5e5e0', borderRadius: 12, background: '#fff' }}
                  >
                    <div>
                      <p className="font-semibold text-sm text-[#2c2c2a]">{s.store_name}</p>
                      <p className="text-xs text-[#888780] mt-0.5">{s.address}</p>
                    </div>
                    <button
                      onClick={() => handleSelectStore(s)}
                      disabled={loading}
                      className="bg-[#0f6e56] text-white text-[13px] font-medium rounded-[8px] px-[16px] py-[8px] cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      선택
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card style={{ maxWidth: 520 }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>환영합니다! 3단계면 시작 🎉</p>
              {storeName && <p style={{ fontSize: 14, color: '#5f5e5a', marginTop: 6 }}>{storeName}</p>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0f6e56', border: '1px solid #0f6e56', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>✓</div>
              <div style={{ height: 2, width: 60, background: '#9fe1cb', flexShrink: 0 }} />
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ef9f27', border: '1px solid #ef9f27', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#633806', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>2</div>
              <div style={{ height: 2, width: 60, background: '#e5e5e0', flexShrink: 0 }} />
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', border: '1px solid #e5e5e0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>3</div>
            </div>

            <div style={{ background: '#e1f5ee', border: '1px solid #9fe1cb', borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>✓ 매장 연결 완료</p>
            </div>

            <PrimaryButton onClick={handleQrDownload}>
              QR PDF 다운로드
            </PrimaryButton>

            {error && <p className="text-[#d32f2f] text-xs">{error}</p>}

            <button onClick={() => router.push('/')} style={btnOutlineStyle}>
              대시보드로 이동
            </button>

            <p className="text-center text-xs text-[#888780]">
              <Link href="/send-setup" className="text-[#0f6e56] font-medium">
                발송 설정하기 (다음 단계) →
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
