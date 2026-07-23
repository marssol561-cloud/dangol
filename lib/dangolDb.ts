import { createClient, SupabaseClient } from "@supabase/supabase-js";

// SupabaseClient's schema generic defaults to "public" and locks callers to it;
// dangol-schema clients need a schema-agnostic type instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DangolClient = SupabaseClient<any, any, any>;

/** 서버 전용. 클라이언트 컴포넌트에서 import 금지. */
export function getServerClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' } }
  );
}

export function getAnonClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!,
    { db: { schema: 'dangol' } }
  );
}
