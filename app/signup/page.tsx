'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUpOwner } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    termsAgreed: false,
    privacyAgreed: false,
    marketingConsent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }
    if (!form.termsAgreed || !form.privacyAgreed) {
      setError('이용약관 및 개인정보 처리방침 동의는 필수입니다');
      return;
    }

    setLoading(true);
    const now = new Date().toISOString();
    const { error: authErr } = await signUpOwner({
      email: form.email,
      password: form.password,
      name: form.name,
      terms_agreed_at: now,
      privacy_agreed_at: now,
      marketing_consent: form.marketingConsent,
    });
    setLoading(false);

    if (authErr) {
      if (authErr.message.toLowerCase().includes('already')) {
        setError('이미 가입된 이메일입니다');
      } else {
        setError(authErr.message);
      }
      return;
    }

    router.push('/onboarding');
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>리붐단골</h1>
        <p style={styles.subtitle}>점주 회원가입</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="이름"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="email"
            placeholder="이메일"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="비밀번호 확인"
            value={form.passwordConfirm}
            onChange={(e) => update('passwordConfirm', e.target.value)}
            required
            style={styles.input}
          />

          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={form.termsAgreed}
              onChange={(e) => update('termsAgreed', e.target.checked)}
            />
            <span>[필수] 이용약관 동의</span>
          </label>
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={form.privacyAgreed}
              onChange={(e) => update('privacyAgreed', e.target.checked)}
            />
            <span>[필수] 개인정보 처리방침 동의</span>
          </label>
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={(e) => update('marketingConsent', e.target.checked)}
            />
            <span>[선택] 마케팅 정보 수신 동의</span>
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div style={styles.links}>
          <span>이미 계정이 있으신가요?</span>
          <Link href="/login" style={styles.link}>
            로그인
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
    maxWidth: 400,
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
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' },
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
  links: { marginTop: 20, display: 'flex', justifyContent: 'center', gap: 8, fontSize: 13, color: '#555' },
  link: { color: '#12787A', textDecoration: 'none', fontWeight: 600 },
};
