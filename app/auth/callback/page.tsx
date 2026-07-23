'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/auth';
import AppHeader from '@/app/components/AppHeader';
import Card from '@/app/components/ui/Card';

// Supabase confirmation links arrive in one of three shapes depending on
// project/template config: PKCE `?code=`, OTP `?token_hash=&type=`, or
// legacy implicit `#access_token=&refresh_token=`. The first and third are
// handled automatically by the browser client's detectSessionInUrl; only
// the token_hash form needs an explicit verifyOtp call.
const EMAIL_OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function isEmailOtpType(value: string): value is EmailOtpType {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

function resolveSafeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const next = resolveSafeNext(searchParams.get('next'));
    let settled = false;

    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      if (ok) {
        router.replace(next);
      } else {
        setFailed(true);
        router.replace('/login?error=auth_callback_failed');
      }
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        finish(true);
      }
    });

    (async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (tokenHash && type && isEmailOtpType(type)) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        finish(!error);
        return;
      }

      // `code=` (PKCE) and `#access_token=` (implicit) are consumed
      // automatically by the client during initialization above.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish(true);
        return;
      }

      window.setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        finish(!!retry.session);
      }, 2000);
    })();

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="auth" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <Card>
          <p style={{ fontSize: 16, color: '#2c2c2a' }}>
            {failed ? '인증에 실패했습니다. 로그인 페이지로 이동합니다...' : '이메일 인증을 처리하고 있습니다...'}
          </p>
        </Card>
      </div>
    </div>
  );
}
