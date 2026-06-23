import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

export default async function AdminSystemPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const { data: meta } = await db.from("app_meta").select("key, value");
  const metaRows = (meta ?? []) as { key: string; value: string }[];
  const schemaVersion = metaRows.find((r) => r.key === "schema_version")?.value ?? "unknown";

  const { count: adminCount } = await db
    .from("admins")
    .select("id", { count: "exact", head: true });

  const { count: auditCount } = await db
    .from("audit_logs")
    .select("id", { count: "exact", head: true });

  const { data: recentAudit } = await db
    .from("audit_logs")
    .select("admin_user, action, target, count, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const auditRows = (recentAudit ?? []) as {
    admin_user: string | null;
    action: string | null;
    target: string | null;
    count: number | null;
    created_at: string;
  }[];

  const tools = [
    { name: "Supabase Dashboard", href: "https://supabase.com/dashboard", desc: "DB 관리" },
    { name: "Vercel Dashboard", href: "https://vercel.com/dashboard", desc: "배포 관리" },
    { name: "Sentry", href: "https://sentry.io", desc: "에러 모니터링" },
    { name: "SOLAPI", href: "https://app.solapi.com", desc: "문자 발송" },
  ];

  const statusCards = [
    { name: "Sentry 모니터링", desc: `스키마 v${schemaVersion} · 관리자 ${adminCount ?? 0}명`, href: "https://sentry.io" },
    { name: "도구창 카드", desc: "Supabase · Vercel · SOLAPI", href: "https://supabase.com/dashboard" },
    { name: "발송 큐", desc: `감사 로그 ${(auditCount ?? 0).toLocaleString()}건 누적`, href: "https://app.solapi.com" },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="시스템" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>시스템·운영</h1>

          {/* 3 status cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {statusCards.map((card) => (
              <a
                key={card.name}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, width: 384, display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0f6e56', flexShrink: 0 }} />
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#2c2c2a' }}>{card.name}</p>
                </div>
                <p style={{ fontSize: 13, color: '#5f5e5a' }}>{card.desc}</p>
              </a>
            ))}
          </div>

          {/* System log */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#2c2c2a' }}>시스템 로그</p>
            {auditRows.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888780' }}>감사 로그 없음</p>
            ) : (
              auditRows.map((a, i) => (
                <p key={i} style={{ fontSize: 13, color: '#5f5e5a' }}>
                  {new Date(a.created_at).toLocaleString("ko-KR")} · {a.action}{a.target ? ` → ${a.target}` : ""}{a.count != null ? ` (${a.count}건)` : ""}
                </p>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
