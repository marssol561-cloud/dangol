'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserSupabase } from '@/lib/auth';

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

  // Check if store already connected
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
    // Get store_code from DB if not already set (resuming session)
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

  // ─── Step: Connect ────────────────────────────────────────
  if (step === 'connect') {
    return (
      <main style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>매장 연결</h1>
          <p style={styles.subtitle}>운영하시는 매장을 검색해 주세요</p>

          <form onSubmit={handleSearch} style={styles.form}>
            <input
              type="text"
              placeholder="매장명"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="주소"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={searching} style={styles.button}>
              {searching ? '검색 중...' : '검색'}
            </button>
          </form>

          {error && <p style={styles.error}>{error}</p>}

          {searched && results.length === 0 && (
            <div style={styles.emptyBox}>
              <p style={styles.emptyText}>등록된 매장이 없습니다.</p>
              {!requestSent ? (
                <form onSubmit={handleStoreRequest} style={styles.form}>
                  <p style={{ fontSize: 13, color: '#555', margin: '4px 0 8px' }}>
                    잇다랩에 매장 등록을 요청할 수 있습니다:
                  </p>
                  <input
                    type="text"
                    placeholder="매장명 *"
                    value={requestName}
                    onChange={(e) => setRequestName(e.target.value)}
                    required
                    style={styles.input}
                  />
                  <input
                    type="text"
                    placeholder="주소"
                    value={requestAddress}
                    onChange={(e) => setRequestAddress(e.target.value)}
                    style={styles.input}
                  />
                  <button type="submit" disabled={loading} style={styles.buttonOutline}>
                    {loading ? '요청 중...' : '잇다랩에 매장 등록 요청'}
                  </button>
                </form>
              ) : (
                <p style={{ color: '#12787A', fontSize: 14 }}>
                  ✓ 매장 등록 요청이 접수되었습니다. 검토 후 연락드리겠습니다.
                </p>
              )}
            </div>
          )}

          {results.length > 0 && (
            <ul style={styles.resultList}>
              {results.map((s) => (
                <li key={s.store_id} style={styles.resultItem}>
                  <div>
                    <strong>{s.store_name}</strong>
                    <p style={styles.resultAddr}>{s.address}</p>
                  </div>
                  <button
                    onClick={() => handleSelectStore(s)}
                    disabled={loading}
                    style={styles.selectBtn}
                  >
                    선택
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    );
  }

  // ─── Step: QR ─────────────────────────────────────────────
  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>QR 코드 발급</h1>
        {storeName && <p style={styles.subtitle}>{storeName}</p>}

        <div style={styles.steps}>
          <div style={styles.stepDone}>✓ 매장 연결 완료</div>
          <div style={styles.stepActive}>QR 발급 · 다운로드</div>
          <div style={styles.stepNext}>
            <Link href="/a9" style={{ color: '#aaa', textDecoration: 'none' }}>
              발송 설정 (다음 단계)
            </Link>
          </div>
        </div>

        <button onClick={handleQrDownload} style={{ ...styles.button, marginTop: 24 }}>
          QR PDF 다운로드
        </button>

        {error && <p style={styles.error}>{error}</p>}

        <button
          onClick={() => router.push('/')}
          style={{ ...styles.buttonOutline, marginTop: 12 }}
        >
          대시보드로 이동
        </button>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
    padding: '1rem',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  title: { margin: 0, fontSize: 24, color: '#12787A' },
  subtitle: { marginTop: 4, marginBottom: 20, color: '#555', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 15,
    outline: 'none',
  },
  button: {
    padding: '0.85rem',
    borderRadius: 8,
    border: 'none',
    background: '#12787A',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  buttonOutline: {
    padding: '0.75rem',
    borderRadius: 8,
    border: '1px solid #12787A',
    background: 'transparent',
    color: '#12787A',
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
  },
  error: { color: '#d32f2f', fontSize: 13, marginTop: 8 },
  emptyBox: {
    marginTop: 16,
    padding: '1rem',
    borderRadius: 8,
    background: '#fafafa',
    border: '1px dashed #ddd',
  },
  emptyText: { fontSize: 14, color: '#555', margin: '0 0 12px' },
  resultList: { listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 8 },
  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderRadius: 8,
    border: '1px solid #e0e0e0',
  },
  resultAddr: { margin: '2px 0 0', fontSize: 12, color: '#777' },
  selectBtn: {
    padding: '0.4rem 1rem',
    borderRadius: 6,
    border: 'none',
    background: '#12787A',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  steps: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 },
  stepDone: { fontSize: 14, color: '#12787A', fontWeight: 600 },
  stepActive: { fontSize: 15, color: '#111', fontWeight: 700 },
  stepNext: { fontSize: 13, color: '#aaa' },
};
