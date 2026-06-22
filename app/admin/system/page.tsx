import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";

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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 text-sm">← 대시보드</Link>
        <h1 className="text-lg font-bold text-gray-900">C6 시스템</h1>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* System info */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">시스템 정보</h2>
          <div className="bg-white rounded-2xl shadow-sm px-5 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">스키마 버전</span>
              <span className="font-mono font-medium">{schemaVersion}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">관리자 수</span>
              <span className="font-medium">{adminCount ?? 0}명</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">감사 로그 건수</span>
              <span className="font-medium">{(auditCount ?? 0).toLocaleString()}건</span>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">운영 도구</h2>
          <div className="grid grid-cols-2 gap-3">
            {tools.map((t) => (
              <a
                key={t.name}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-2xl shadow-sm px-4 py-3 hover:bg-gray-50 transition"
              >
                <p className="text-sm font-medium text-teal-700">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Recent audit logs */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">최근 감사 로그</h2>
          {auditRows.length === 0 ? (
            <p className="text-sm text-gray-400">감사 로그 없음</p>
          ) : (
            <div className="space-y-2">
              {auditRows.map((a, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm px-4 py-3 text-xs text-gray-600 flex justify-between">
                  <span>
                    <span className="font-medium">{a.action}</span>
                    {" → "}{a.target}
                    {a.count != null ? ` (${a.count}건)` : ""}
                  </span>
                  <span className="text-gray-400 shrink-0 ml-2">
                    {new Date(a.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
