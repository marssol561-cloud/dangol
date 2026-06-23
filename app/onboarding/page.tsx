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

  const btnOutline = 'border border-[#e5e5e0] text-[#5f5e5a] font-semibold text-sm rounded-[8px] py-[14px] px-[20px] w-full cursor-pointer';

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="auth" />
      <div className="flex flex-col items-center p-[48px] w-full">
        {step === 'connect' ? (
          <Card className="w-[420px]">
            <div>
              <p className="text-[24px] font-semibold text-[#2c2c2a]">매장 연결</p>
              <p className="text-[14px] text-[#5f5e5a] mt-[6px]">운영하시는 매장을 검색해 주세요</p>
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
              <div className="p-[16px] bg-[#f8f7f4] border border-[#e5e5e0] rounded-[12px] flex flex-col gap-[12px]">
                <p className="text-sm text-[#5f5e5a]">등록된 매장이 없습니다.</p>
                {!requestSent ? (
                  <form onSubmit={handleStoreRequest} className="flex flex-col gap-[12px]">
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
                    <button type="submit" disabled={loading} className={btnOutline}>
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
              <ul className="flex flex-col gap-[8px]">
                {results.map((s) => (
                  <li
                    key={s.store_id}
                    className="flex justify-between items-center p-[16px] border border-[#e5e5e0] rounded-[12px] bg-white"
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
          <Card className="w-[420px]">
            <div>
              <p className="text-[24px] font-semibold text-[#2c2c2a]">QR 코드 발급</p>
              {storeName && <p className="text-[14px] text-[#5f5e5a] mt-[6px]">{storeName}</p>}
            </div>

            <div className="flex items-center gap-[8px]">
              <div className="w-7 h-7 rounded-full bg-[#0f6e56] flex items-center justify-center text-white text-xs font-semibold">✓</div>
              <div className="h-0.5 w-12 bg-[#9fe1cb]" />
              <div className="w-7 h-7 rounded-full bg-[#ef9f27] flex items-center justify-center text-[#633806] text-xs font-semibold">2</div>
              <div className="h-0.5 w-12 bg-[#e5e5e0]" />
              <div className="w-7 h-7 rounded-full border border-[#e5e5e0] flex items-center justify-center text-[#888780] text-xs font-semibold">3</div>
            </div>

            <div className="bg-[#e1f5ee] border border-[#9fe1cb] rounded-[12px] p-[16px]">
              <p className="text-sm font-semibold text-[#085041]">✓ 매장 연결 완료</p>
            </div>

            <PrimaryButton onClick={handleQrDownload}>
              QR PDF 다운로드
            </PrimaryButton>

            {error && <p className="text-[#d32f2f] text-xs">{error}</p>}

            <button onClick={() => router.push('/')} className={btnOutline}>
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
