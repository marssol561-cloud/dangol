import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

function serviceClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' }, auth: { persistSession: false } }
  );
}

export async function isAdmin(userId: string): Promise<boolean> {
  const db = serviceClient();
  const { data } = await db
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return data !== null;
}

export async function requireAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) notFound();
}
