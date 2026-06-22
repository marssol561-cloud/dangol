// Server-only: resolves the current session user's owner context.
import { getSessionUser } from "@/lib/auth.server";
import { getServerClient } from "@/lib/dangolDb";

export interface OwnerContext {
  userId: string;
  storeLinkId: string;
  role: string;
}

export async function getOwnerContext(): Promise<OwnerContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = getServerClient();
  const { data: row } = await db
    .from("owners")
    .select("role, store_link_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!row) return null;
  const { role, store_link_id } = row as { role: string; store_link_id: string | null };
  if (!store_link_id) return null;
  return { userId: user.id, storeLinkId: store_link_id, role };
}
