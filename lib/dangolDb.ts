import { createClient } from "@supabase/supabase-js";

/** 서버 전용. 클라이언트 컴포넌트에서 import 금지. */
export function getServerClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!
  );
}

export function getAnonClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_ANON_KEY!
  );
}
