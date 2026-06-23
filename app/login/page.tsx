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
    <main className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
      <div className="bg-white border border-[#e5e5e0] rounded-xl p-8 w-full max-w-[420px] shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-bold text-[#0f6e56] leading-tight">리붐단골</h1>
          <p className="mt-1 text-sm text-[#5f5e5a]">사장님 로그인</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5f5e5a]">이메일</label>
            <input
              type="email"
              placeholder="이메일을 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5f5e5a]">비밀번호</label>
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors"
            />
          </div>

          {error && (
            <p className="text-[#d32f2f] text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-[#0f6e56] text-white font-semibold text-[15px] rounded-lg py-3.5 w-full cursor-pointer disabled:opacity-60"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-5 flex justify-center items-center gap-2 text-[13px]">
          <button
            onClick={handlePasswordReset}
            className="text-[#0f6e56] bg-transparent border-none cursor-pointer p-0"
          >
            비밀번호 재설정
          </button>
          <span className="text-[#e5e5e0]">|</span>
          <Link href="/signup" className="text-[#0f6e56] font-medium">
            회원가입
          </Link>
        </div>
      </div>
    </main>
  );
}
