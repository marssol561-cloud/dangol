import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

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
    { href: "/admin/stores", label: "매장" },
    { href: "/admin/customers", label: "통합 고객" },
    { href: "/admin/messages", label: "발송·비용" },
    { href: "/admin/consents", label: "동의·법무" },
    { href: "/admin/system", label: "시스템" },
    { href: "/admin/channels", label: "채널 연결" },
  ];

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="통합 대시보드" />

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold text-[#2c2c2a] mb-6">통합 대시보드</h1>

        <div className="max-w-3xl flex flex-col gap-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {kpis.map((k) => (
              <div key={k.label} style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:20 }}>
                <p className="text-xs text-[#888780] mb-1">{k.label}</p>
                <p className="text-2xl font-bold text-[#2c2c2a]">{typeof k.value === "number" ? k.value.toLocaleString() : k.value}</p>
              </div>
            ))}
          </div>

          {/* Nav */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {navItems.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:'12px 16px' }} className="text-sm font-medium text-[#085041] block"
              >
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
