import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";

const CONSENT_LABELS: Record<string, string> = {
  required: "필수 동의",
  thirdparty: "3자 제공",
  ad_sms: "SMS 광고",
  ad_kakao: "카카오 광고",
  ad_email: "이메일 광고",
};

export default async function AdminConsentsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const { data: consents } = await db
    .from("consents")
    .select("type, agreed, revoked_at");

  const rows = (consents ?? []) as { type: string; agreed: boolean; revoked_at: string | null }[];

  // Aggregate per type
  const stats: Record<string, { agreed: number; declined: number; revoked: number }> = {};
  for (const r of rows) {
    if (!stats[r.type]) stats[r.type] = { agreed: 0, declined: 0, revoked: 0 };
    if (r.revoked_at) stats[r.type].revoked++;
    else if (r.agreed) stats[r.type].agreed++;
    else stats[r.type].declined++;
  }

  const types = ["required", "thirdparty", "ad_sms", "ad_kakao", "ad_email"];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 text-sm">← 대시보드</Link>
        <h1 className="text-lg font-bold text-gray-900">C5 동의 / 법무</h1>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {types.map((t) => {
            const s = stats[t] ?? { agreed: 0, declined: 0, revoked: 0 };
            const total = s.agreed + s.declined + s.revoked;
            const rate = total > 0 ? Math.round((s.agreed / total) * 100) : 0;
            return (
              <div key={t} className="bg-white rounded-2xl shadow-sm px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-800">{CONSENT_LABELS[t] ?? t}</p>
                  <span className="text-xs text-gray-500">{rate}% 동의</span>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-gray-400">동의</p>
                    <p className="text-lg font-bold text-teal-600">{s.agreed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">미동의</p>
                    <p className="text-lg font-bold text-gray-400">{s.declined}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">철회</p>
                    <p className="text-lg font-bold text-red-400">{s.revoked}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="text-sm font-medium text-amber-800">동의 텍스트 버전</p>
          <p className="text-xs text-amber-600 mt-1">
            현재 버전: v1.0 (SP-3 기준). 텍스트 변경 시 개인정보보호책임자 검토 필요.
          </p>
        </div>
      </div>
    </main>
  );
}
