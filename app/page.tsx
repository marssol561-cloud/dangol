import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerContext } from "@/lib/ownerAuth";
import { monthlyStats, consentRate, messageEffect, todayCards, type TodayCard } from "@/lib/dashboard";
import { getServerClient } from "@/lib/dangolDb";
import AppHeader from "@/app/components/AppHeader";

export default async function OwnerDashboardPage() {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") redirect("/login");

  const db = getServerClient();

  const [monthly, consent, effect, cards, sendChRow] = await Promise.all([
    monthlyStats(ctx.storeLinkId),
    consentRate(ctx.storeLinkId),
    messageEffect(ctx.storeLinkId),
    todayCards(ctx.storeLinkId),
    db
      .from("send_channels")
      .select("setup_step, connected")
      .eq("store_link_id", ctx.storeLinkId)
      .maybeSingle(),
  ]);

  const sendChannel = (sendChRow.data as { setup_step: number; connected: boolean } | null) ?? {
    setup_step: 0,
    connected: false,
  };

  const isEmpty = monthly.newCustomers === 0 && monthly.cumulativeRegulars === 0;

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="대시보드" />

      <main className="flex-1 p-8">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>대시보드</h1>
        </div>

        {isEmpty ? (
          <EmptyState storeLinkId={ctx.storeLinkId} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* 6 KPI stat cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Link href="/customers?filter=new" style={{ width: 224, background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none' }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>신규 고객</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{monthly.newCustomers}</p>
                <p style={{ fontSize: 12, color: '#888780' }}>이번 달</p>
              </Link>
              <Link href="/customers?filter=returning" style={{ width: 224, background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none' }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>재방문</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{monthly.returningVisits}</p>
                <p style={{ fontSize: 12, color: '#888780' }}>이번 달</p>
              </Link>
              <div style={{ width: 224, background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>재방문율</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{Math.round(monthly.returnRate * 100)}%</p>
                <p style={{ fontSize: 12, color: '#888780' }}>이번 달</p>
              </div>
              <Link href="/customers" style={{ width: 224, background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none' }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>누적 단골 이상</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{monthly.cumulativeRegulars}</p>
                <p style={{ fontSize: 12, color: '#888780' }}>명</p>
              </Link>
              <div style={{ width: 224, background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 14, color: '#5f5e5a' }}>광고 동의율</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{Math.round(consent.rate * 100)}%</p>
                <p style={{ fontSize: 12, color: '#888780' }}>{consent.consented}/{consent.total}명</p>
              </div>
            </div>

            {/* Message effect banner */}
            {effect.revisitCount > 0 && (
              <div style={{ background: '#e1f5ee', border: '1px solid #9fe1cb', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#085041' }}>📨 소식 효과</p>
                <p style={{ fontSize: 14, color: '#085041' }}>
                  소식 받고 다시 온 단골 <strong style={{ fontWeight: 700 }}>{effect.revisitCount}명</strong>
                </p>
              </div>
            )}

            {/* Today action cards */}
            {cards.some((c) => c.count > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 12, color: '#888780' }}>오늘 할 일</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {cards.filter((c) => c.count > 0).map((card: TodayCard) => (
                    <Link
                      key={card.segment}
                      href={`/messages?segment=${card.segment}`}
                      style={{ width: 389, background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, textDecoration: 'none' }}
                    >
                      <p style={{ fontSize: 14, color: '#5f5e5a' }}>{card.label}</p>
                      <p style={{ fontSize: 24, fontWeight: 700, color: '#2c2c2a' }}>{card.count}명</p>
                      <div style={{ background: '#ef9f27', color: '#633806', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, alignSelf: 'flex-start' }}>
                        소식 보내기 →
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Send channel status */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {sendChannel.connected ? (
            <p style={{ fontSize: 12, color: '#888780' }}>✓ 소식 발송 연결됨</p>
          ) : (
            <span style={{ background: '#faeeda', borderRadius: 999, padding: '6px 12px', fontSize: 12, color: '#633806', display: 'inline-block' }}>
              <Link href="/send-setup" style={{ color: '#633806', textDecoration: 'none' }}>
                소식 발송 설정하기 ({sendChannel.setup_step}/4단계 완료)
              </Link>
            </span>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ storeLinkId }: { storeLinkId: string }) {
  void storeLinkId;
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:40 }} className="text-center">
      <p className="text-4xl mb-4">🏪</p>
      <p className="text-lg font-semibold text-[#2c2c2a] mb-2">첫 손님을 받아보세요</p>
      <p className="text-sm text-[#888780] mb-6">QR 코드를 출력해 카운터에 붙여두세요</p>
      <Link
        href="/api/qr"
        className="inline-block bg-[#0f6e56] text-white px-6 py-3 rounded-lg text-sm font-semibold"
      >
        QR PDF 다운로드
      </Link>
      <p className="mt-4">
        <Link href="/settings" className="text-xs text-[#888780] underline">
          매장 설정
        </Link>
      </p>
    </div>
  );
}
