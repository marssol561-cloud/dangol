import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth.server";
import { isAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({}, { status: 404 });
  if (!(await isAdmin(user.id))) return NextResponse.json({}, { status: 404 });

  const db = getServerClient();

  const [ownerRes, customerRes, thirdpartyRes, sentRes, todayRes] =
    await Promise.all([
      db.from("owners").select("id", { count: "exact", head: true }),
      db.from("customers").select("id", { count: "exact", head: true }),
      db
        .from("consents")
        .select("id", { count: "exact", head: true })
        .eq("type", "thirdparty")
        .eq("agreed", true),
      db.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent"),
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    ]);

  const customerCount = customerRes.count ?? 0;
  const consentCount = thirdpartyRes.count ?? 0;

  return NextResponse.json({
    owner_count: ownerRes.count ?? 0,
    customer_count: customerCount,
    consent_rate: customerCount > 0 ? Math.round((consentCount / customerCount) * 100) : 0,
    sent_count: sentRes.count ?? 0,
    today_count: todayRes.count ?? 0,
  });
}
