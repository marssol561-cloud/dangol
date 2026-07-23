import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// Browser client (Client Components only)
// ============================================================
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_DANGOL_DB_URL!,
    process.env.NEXT_PUBLIC_DANGOL_DB_ANON_KEY!,
    { db: { schema: 'dangol' } }
  );
}

// ============================================================
// Auth helpers — browser-side
// ============================================================
export interface SignUpOwnerParams {
  email: string;
  password: string;
  name: string;
  terms_agreed_at: string;
  privacy_agreed_at: string;
  marketing_consent: boolean;
}

export async function signUpOwner(params: SignUpOwnerParams) {
  const supabase = getBrowserSupabase();
  return supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        name: params.name,
        terms_agreed_at: params.terms_agreed_at,
        privacy_agreed_at: params.privacy_agreed_at,
        marketing_consent: params.marketing_consent,
      },
    },
  });
}

export async function signInOwner(email: string, password: string) {
  const supabase = getBrowserSupabase();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOutOwner() {
  const supabase = getBrowserSupabase();
  return supabase.auth.signOut();
}
