'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUpOwner } from '@/lib/auth';
import AppHeader from '@/app/components/AppHeader';

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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="auth" />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-12">
      <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 w-full max-w-[440px]">
        <h1 className="text-2xl font-semibold text-[#2c2c2a] mb-4">점주 회원가입</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5f5e5a]">이름</label>
            <input
              type="text"
              placeholder="이름"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
              className="bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5f5e5a]">이메일</label>
            <input
              type="email"
              placeholder="이메일"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              required
              className="bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5f5e5a]">비밀번호 (6자 이상)</label>
            <input
              type="password"
              placeholder="비밀번호"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              required
              minLength={6}
              className="bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5f5e5a]">비밀번호 확인</label>
            <input
              type="password"
              placeholder="비밀번호 확인"
              value={form.passwordConfirm}
              onChange={(e) => update('passwordConfirm', e.target.value)}
              required
              className="bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <label className="flex items-center gap-2 text-[13px] text-[#2c2c2a] cursor-pointer">
              <input
                type="checkbox"
                checked={form.termsAgreed}
                onChange={(e) => update('termsAgreed', e.target.checked)}
                className="accent-[#0f6e56]"
              />
              [필수] 이용약관 동의
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#2c2c2a] cursor-pointer">
              <input
                type="checkbox"
                checked={form.privacyAgreed}
                onChange={(e) => update('privacyAgreed', e.target.checked)}
                className="accent-[#0f6e56]"
              />
              [필수] 개인정보 처리방침 동의
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#2c2c2a] cursor-pointer">
              <input
                type="checkbox"
                checked={form.marketingConsent}
                onChange={(e) => update('marketingConsent', e.target.checked)}
                className="accent-[#0f6e56]"
              />
              [선택] 마케팅 정보 수신 동의
            </label>
          </div>

          {error && <p className="text-[#d32f2f] text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-[#0f6e56] text-white font-semibold text-[15px] rounded-lg py-3.5 w-full cursor-pointer disabled:opacity-60"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="mt-5 flex justify-center items-center gap-2 text-[13px] text-[#5f5e5a]">
          <span>이미 계정이 있으신가요?</span>
          <Link href="/login" className="text-[#0f6e56] font-semibold">
            로그인
          </Link>
        </div>
      </div>
      </main>
    </div>
  );
}
