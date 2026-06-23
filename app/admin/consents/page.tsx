import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

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

  const stats: Record<string, { agreed: number; declined: number; revoked: number }> = {};
  for (const r of rows) {
    if (!stats[r.type]) stats[r.type] = { agreed: 0, declined: 0, revoked: 0 };
    if (r.revoked_at) stats[r.type].revoked++;
    else if (r.agreed) stats[r.type].agreed++;
    else stats[r.type].declined++;
  }

  const types = ["required", "thirdparty", "ad_sms", "ad_kakao", "ad_email"];

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="동의·법무" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#888780] text-sm">← 대시보드</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">동의 / 법무</h1>
        </div>

        <div className="max-w-3xl flex flex-col gap-3">
          {types.map((t) => {
            const s = stats[t] ?? { agreed: 0, declined: 0, revoked: 0 };
            const total = s.agreed + s.declined + s.revoked;
            const rate = total > 0 ? Math.round((s.agreed / total) * 100) : 0;
            return (
              <div key={t} className="bg-white border border-[#e5e5e0] rounded-xl px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-[#2c2c2a]">{CONSENT_LABELS[t] ?? t}</p>
                  <span className="text-xs text-[#888780]">{rate}% 동의</span>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-[#888780]">동의</p>
                    <p className="text-lg font-bold text-[#085041]">{s.agreed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#888780]">미동의</p>
                    <p className="text-lg font-bold text-[#888780]">{s.declined}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#888780]">철회</p>
                    <p className="text-lg font-bold text-[#d32f2f]">{s.revoked}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-[#faeeda] border border-[#ef9f27] rounded-xl px-5 py-4">
            <p className="text-sm font-medium text-[#633806]">동의 텍스트 버전</p>
            <p className="text-xs text-[#633806] mt-1">
              현재 버전: v1.0 (SP-3 기준). 텍스트 변경 시 개인정보보호책임자 검토 필요.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
