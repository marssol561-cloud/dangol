'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInOwner } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: authErr } = await signInOwner(email, password);
    setLoading(false);

    if (authErr) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다');
      return;
    }

    const user = data.user;
    if (!user) {
      setError('로그인 오류가 발생했습니다');
      return;
    }

    // Check if owner already has a connected store
    const { getBrowserSupabase } = await import('@/lib/auth');
    const supabase = getBrowserSupabase();
    const { data: owner } = await supabase
      .from('owners')
      .select('store_link_id')
      .eq('id', user.id)
      .maybeSingle();

    if (owner?.store_link_id) {
      router.push('/');
    } else {
      router.push('/onboarding');
    }
  }

  async function handlePasswordReset() {
    if (!email) {
      setError('비밀번호 재설정을 위해 이메일을 입력해주세요');
      return;
    }
    const { getBrowserSupabase } = await import('@/lib/auth');
    const supabase = getBrowserSupabase();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/reset-password`,
    });
    setError('비밀번호 재설정 이메일을 발송했습니다');
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>리붐단골</h1>
        <p style={styles.subtitle}>점주 로그인</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={styles.links}>
          <button onClick={handlePasswordReset} style={styles.linkBtn}>
            비밀번호 재설정
          </button>
          <span style={styles.divider}>|</span>
          <Link href="/signup" style={styles.link}>
            회원가입
          </Link>
        </div>
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
    maxWidth: 380,
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  title: { margin: 0, fontSize: 28, color: '#12787A', textAlign: 'center' },
  subtitle: { marginTop: 4, marginBottom: 24, color: '#555', textAlign: 'center', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 15,
    outline: 'none',
  },
  button: {
    marginTop: 8,
    padding: '0.85rem',
    borderRadius: 8,
    border: 'none',
    background: '#12787A',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#d32f2f', fontSize: 13, margin: 0 },
  links: { marginTop: 20, display: 'flex', justifyContent: 'center', gap: 8, fontSize: 13 },
  linkBtn: { background: 'none', border: 'none', color: '#12787A', cursor: 'pointer', fontSize: 13, padding: 0 },
  link: { color: '#12787A', textDecoration: 'none' },
  divider: { color: '#ccc' },
};
