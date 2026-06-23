'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserSupabase } from '@/lib/auth';
import AppHeader from '@/app/components/AppHeader';

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

  const inputCls = "bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors w-full";
  const btnPrimary = "bg-[#0f6e56] text-white font-semibold text-[15px] rounded-lg py-3.5 w-full cursor-pointer disabled:opacity-60";
  const btnOutline = "border border-[#e5e5e0] text-[#5f5e5a] font-semibold text-sm rounded-lg py-3 w-full cursor-pointer";

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="auth" />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-12">
        {step === 'connect' ? (
          <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 w-full max-w-[480px]">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-[#2c2c2a] leading-tight">매장 연결</h1>
              <p className="mt-1 text-sm text-[#5f5e5a]">운영하시는 매장을 검색해 주세요</p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5f5e5a]">매장명</label>
                <input
                  type="text"
                  placeholder="매장명"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5f5e5a]">주소</label>
                <input
                  type="text"
                  placeholder="주소"
                  value={searchAddress}
                  onChange={(e) => setSearchAddress(e.target.value)}
                  className={inputCls}
                />
              </div>
              <button type="submit" disabled={searching} className={btnPrimary}>
                {searching ? '검색 중...' : '검색'}
              </button>
            </form>

            {error && <p className="text-[#d32f2f] text-xs mt-3">{error}</p>}

            {searched && results.length === 0 && (
              <div className="mt-4 p-4 bg-[#f8f7f4] border border-[#e5e5e0] rounded-xl">
                <p className="text-sm text-[#5f5e5a] mb-3">등록된 매장이 없습니다.</p>
                {!requestSent ? (
                  <form onSubmit={handleStoreRequest} className="flex flex-col gap-3">
                    <p className="text-xs text-[#888780]">잇다랩에 매장 등록을 요청할 수 있습니다:</p>
                    <input
                      type="text"
                      placeholder="매장명 *"
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      required
                      className={inputCls}
                    />
                    <input
                      type="text"
                      placeholder="주소"
                      value={requestAddress}
                      onChange={(e) => setRequestAddress(e.target.value)}
                      className={inputCls}
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
              <ul className="mt-4 flex flex-col gap-2">
                {results.map((s) => (
                  <li
                    key={s.store_id}
                    className="flex justify-between items-center p-4 border border-[#e5e5e0] rounded-xl bg-white"
                  >
                    <div>
                      <p className="font-semibold text-sm text-[#2c2c2a]">{s.store_name}</p>
                      <p className="text-xs text-[#888780] mt-0.5">{s.address}</p>
                    </div>
                    <button
                      onClick={() => handleSelectStore(s)}
                      disabled={loading}
                      className="bg-[#0f6e56] text-white text-[13px] font-medium rounded-lg px-4 py-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      선택
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 w-full max-w-[480px]">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-[#2c2c2a]">QR 코드 발급</h1>
              {storeName && <p className="text-sm text-[#5f5e5a] mt-1">{storeName}</p>}
            </div>

            <div className="flex items-center gap-2 mb-6">
              <div className="w-7 h-7 rounded-full bg-[#0f6e56] flex items-center justify-center text-white text-xs font-semibold">✓</div>
              <div className="h-0.5 w-12 bg-[#9fe1cb]" />
              <div className="w-7 h-7 rounded-full bg-[#ef9f27] flex items-center justify-center text-[#633806] text-xs font-semibold">2</div>
              <div className="h-0.5 w-12 bg-[#e5e5e0]" />
              <div className="w-7 h-7 rounded-full border border-[#e5e5e0] flex items-center justify-center text-[#888780] text-xs font-semibold">3</div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="bg-[#e1f5ee] border border-[#9fe1cb] rounded-xl p-4">
                <p className="text-sm font-semibold text-[#085041]">✓ 매장 연결 완료</p>
              </div>
              <button onClick={handleQrDownload} className={btnPrimary}>
                QR PDF 다운로드
              </button>
            </div>

            {error && <p className="text-[#d32f2f] text-xs mt-3">{error}</p>}

            <div className="mt-3 flex flex-col gap-2">
              <button onClick={() => router.push('/')} className={btnOutline}>
                대시보드로 이동
              </button>
              <p className="text-center text-xs text-[#888780]">
                <Link href="/send-setup" className="text-[#0f6e56] font-medium">
                  발송 설정하기 (다음 단계) →
                </Link>
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
