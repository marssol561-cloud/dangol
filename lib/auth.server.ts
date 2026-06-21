import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ============================================================
// Server client (Server Components, API Routes, middleware)
// ============================================================
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function getSessionUser() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}
