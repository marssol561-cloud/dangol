import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import AppHeader from "@/app/components/AppHeader";

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

  const reqStats = stats["required"] ?? { agreed: 0, declined: 0, revoked: 0 };
  const thirdStats = stats["thirdparty"] ?? { agreed: 0, declined: 0, revoked: 0 };
  const adStats = ["ad_sms", "ad_kakao", "ad_email"].reduce(
    (acc, t) => {
      const s = stats[t] ?? { agreed: 0, declined: 0, revoked: 0 };
      return { agreed: acc.agreed + s.agreed, declined: acc.declined + s.declined, revoked: acc.revoked + s.revoked };
    },
    { agreed: 0, declined: 0, revoked: 0 }
  );
  const revokedTotal = types.reduce((acc, t) => acc + (stats[t]?.revoked ?? 0), 0);

  function pct(s: { agreed: number; declined: number; revoked: number }) {
    const total = s.agreed + s.declined + s.revoked;
    return total > 0 ? Math.round((s.agreed / total) * 100) : 0;
  }

  const statCards = [
    { label: "필수 동의", value: `${pct(reqStats)}%` },
    { label: "제3자 제공 동의", value: `${pct(thirdStats)}%` },
    { label: "광고 수신 동의", value: `${pct(adStats)}%` },
    { label: "수신거부 처리", value: `${revokedTotal}건` },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="동의·법무" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>동의·법무 관리</h1>

          {/* Consent version card */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#2c2c2a' }}>동의 문구 버전</p>
              <button style={{ border: '1px solid #e5e5e0', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600, color: '#5f5e5a', background: '#fff', cursor: 'pointer' }}>새 버전</button>
            </div>
            <p style={{ fontSize: 13, color: '#5f5e5a' }}>v1.2 (현행) · 변호사 검토 완료</p>
            <p style={{ fontSize: 13, color: '#5f5e5a' }}>v1.0 · SP-3 기준</p>
          </div>

          {/* 4 stat cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {statCards.map((sc) => (
              <div key={sc.label} style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, width: 278, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 13, color: '#5f5e5a' }}>{sc.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#085041' }}>{sc.value}</p>
              </div>
            ))}
          </div>

          {/* Amber warning card */}
          <div style={{ background: '#faeeda', border: '1px solid #ef9f27', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6, color: '#633806' }}>
            <p style={{ fontSize: 15, fontWeight: 600 }}>개인정보 자동 파기 (법적 필수)</p>
            <p style={{ fontSize: 13 }}>마지막 방문 +2년 또는 동의 철회 시 자동 파기 · 텍스트 변경 시 개인정보보호책임자 검토 필요.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
