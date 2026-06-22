import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require any authenticated user
const PROTECTED = ['/', '/onboarding', '/stamps', '/coupon-use', '/messages', '/send-setup', '/automation', '/customers', '/settings', '/admin'];

// Routes that staff role cannot access (owner-only)
const OWNER_ONLY = ['/', '/onboarding', '/stamps', '/messages', '/send-setup', '/automation', '/customers', '/settings'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session (must call getUser, not getSession)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin routes: hide existence — return 404 for non-admins (no redirect)
  const isAdminRoute =
    pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (isAdminRoute) {
    if (!user) {
      return new NextResponse(null, { status: 404 });
    }
    const adminDb = createClient(
      process.env.DANGOL_DB_URL!,
      process.env.DANGOL_DB_SERVICE_ROLE_KEY!
    );
    const { data: adminRow } = await adminDb
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!adminRow) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Staff role: can only access /coupon-use among owner routes
  if (user && OWNER_ONLY.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    const db = createClient(
      process.env.DANGOL_DB_URL!,
      process.env.DANGOL_DB_SERVICE_ROLE_KEY!
    );
    const { data: ownerRow } = await db
      .from('owners')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (ownerRow && (ownerRow as { role: string }).role === 'staff') {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/coupon-use';
      return NextResponse.redirect(redirect);
    }
  }

  return supabaseResponse;
}

export const config = {
  // Skip Next.js internals, static files, and public routes.
  // api/admin/* is included (negative lookahead: skip api/ unless followed by admin)
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|r/|api/(?!admin)|login|signup).*)',
  ],
};
