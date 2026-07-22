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
      // eslint-disable-next-line react-hooks/purity -- server component; 24h window from request time is intentionally time-dependent
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
  ]);

  const ownerCount = ownerRes.count ?? 0;
  const customerCount = customerRes.count ?? 0;
  const consentCount = thirdpartyRes.count ?? 0;
  const consentRate = customerCount > 0 ? Math.round((consentCount / customerCount) * 100) : 0;
  const sentCount = sentRes.count ?? 0;
  const todayCount = todayRes.count ?? 0;

  const kpis = [
    { label: "가입 점주 (1차 KPI)", value: ownerCount },
    { label: "누적 고객 (2차 KPI)", value: customerCount },
    { label: "평균 동의율", value: `${consentRate}%` },
    { label: "이번 달 발송", value: sentCount },
    { label: "오늘 발송", value: todayCount },
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
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="통합 대시보드" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>통합 대시보드</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* KPI cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, width: 278, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>{k.label}</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{typeof k.value === "number" ? k.value.toLocaleString() : k.value}</p>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#2c2c2a' }}>데이터 적재 추이 (일자별)</p>
            <div style={{ background: '#f8f7f4', border: '1px solid #e5e5e0', borderRadius: 8, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: '#888780' }}>[ 라인 차트 — 고객·발송 적재 추이 ]</p>
            </div>
          </div>

          {/* Quick nav */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {navItems.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: '12px 20px', textDecoration: 'none', fontSize: 14, fontWeight: 500, color: '#085041' }}
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
