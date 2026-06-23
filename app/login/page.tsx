'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInOwner } from '@/lib/auth';
import AppHeader from '@/app/components/AppHeader';
import Card from '@/app/components/ui/Card';
import FormField from '@/app/components/ui/FormField';
import Input from '@/app/components/ui/Input';
import PrimaryButton from '@/app/components/ui/PrimaryButton';

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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="auth" />
      <div className="flex flex-col items-center p-[48px] w-full">
        <Card>
          <p className="text-[24px] font-semibold text-[#2c2c2a]">사장님 로그인</p>

          <form onSubmit={handleSubmit} className="contents">
            <FormField label="이메일">
              <Input
                type="email"
                placeholder="owner@store.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormField>

            <FormField label="비밀번호">
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </FormField>

            {error && <p className="text-[#d32f2f] text-xs">{error}</p>}

            <PrimaryButton type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </PrimaryButton>
          </form>

          <div className="flex items-center gap-[6px]">
            <span className="text-[13px] text-[#5f5e5a]">계정이 없으세요?</span>
            <Link href="/signup" className="text-[13px] font-medium text-[#0f6e56]">
              회원가입
            </Link>
          </div>

          <button
            onClick={handlePasswordReset}
            className="text-[13px] font-medium text-[#0f6e56] bg-transparent border-none cursor-pointer p-0 text-left"
          >
            비밀번호 찾기
          </button>
        </Card>
      </div>
    </div>
  );
}
