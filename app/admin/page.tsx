import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const [
    ownerRes,
    customerRes,
    thirdpartyRes,
    sentRes,
    todayRes,
  ] = await Promise.all([
    db.from("owners").select("id", { count: "exact", head: true }),
    db.from("customers").select("id", { count: "exact", head: true }),
    db.from("consents").select("id", { count: "exact", head: true }).eq("type", "thirdparty").eq("agreed", true),
    db.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent"),
    db.from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
  ]);

  const ownerCount = ownerRes.count ?? 0;
  const customerCount = customerRes.count ?? 0;
  const consentCount = thirdpartyRes.count ?? 0;
  const consentRate = customerCount > 0 ? Math.round((consentCount / customerCount) * 100) : 0;
  const sentCount = sentRes.count ?? 0;
  const todayCount = todayRes.count ?? 0;

  const kpis = [
    { label: "가입 점주 수", value: ownerCount },
    { label: "누적 고객 수", value: customerCount },
    { label: "3자 동의율", value: `${consentRate}%` },
    { label: "누적 발송 수", value: sentCount },
    { label: "오늘 발송 수", value: todayCount },
  ];

  const navItems = [
    { href: "/admin/stores", label: "C2 매장 목록" },
    { href: "/admin/customers", label: "C3 통합 고객" },
    { href: "/admin/messages", label: "C4 메시지/비용" },
    { href: "/admin/consents", label: "C5 동의/법무" },
    { href: "/admin/system", label: "C6 시스템" },
    { href: "/admin/channels", label: "C7 채널 모니터링" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">ReBoom 관리자 — C1 대시보드</h1>
        <span className="text-xs text-gray-400">ADMIN</span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs text-gray-400 mb-1">{k.label}</p>
              <p className="text-2xl font-bold text-gray-900">{k.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Nav */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {navItems.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="bg-white rounded-2xl shadow-sm px-4 py-3 text-sm font-medium text-teal-700 hover:bg-teal-50 transition"
            >
              {n.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
