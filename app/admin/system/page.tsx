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

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="시스템" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#888780] text-sm">← 대시보드</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">시스템</h1>
        </div>

        <div className="max-w-3xl flex flex-col gap-6">
          {/* System info */}
          <section>
            <h2 className="text-sm font-semibold text-[#5f5e5a] mb-3">시스템 정보</h2>
            <div className="bg-white border border-[#e5e5e0] rounded-xl px-5 py-4 flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#888780]">스키마 버전</span>
                <span className="font-mono font-medium text-[#2c2c2a]">{schemaVersion}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#888780]">관리자 수</span>
                <span className="font-medium text-[#2c2c2a]">{adminCount ?? 0}명</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#888780]">감사 로그 건수</span>
                <span className="font-medium text-[#2c2c2a]">{(auditCount ?? 0).toLocaleString()}건</span>
              </div>
            </div>
          </section>

          {/* Tools */}
          <section>
            <h2 className="text-sm font-semibold text-[#5f5e5a] mb-3">운영 도구</h2>
            <div className="grid grid-cols-2 gap-3">
              {tools.map((t) => (
                <a
                  key={t.name}
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white border border-[#e5e5e0] rounded-xl px-4 py-3"
                >
                  <p className="text-sm font-medium text-[#085041]">{t.name}</p>
                  <p className="text-xs text-[#888780] mt-0.5">{t.desc}</p>
                </a>
              ))}
            </div>
          </section>

          {/* Recent audit logs */}
          <section>
            <h2 className="text-sm font-semibold text-[#5f5e5a] mb-3">최근 감사 로그</h2>
            {auditRows.length === 0 ? (
              <p className="text-sm text-[#888780]">감사 로그 없음</p>
            ) : (
              <div className="flex flex-col gap-2">
                {auditRows.map((a, i) => (
                  <div key={i} className="bg-white border border-[#e5e5e0] rounded-xl px-4 py-3 text-xs text-[#5f5e5a] flex justify-between">
                    <span>
                      <span className="font-medium">{a.action}</span>
                      {" → "}{a.target}
                      {a.count != null ? ` (${a.count}건)` : ""}
                    </span>
                    <span className="text-[#888780] shrink-0 ml-2">
                      {new Date(a.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
