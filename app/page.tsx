import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerContext } from "@/lib/ownerAuth";
import { monthlyStats, consentRate, messageEffect, todayCards, type TodayCard } from "@/lib/dashboard";
import { getEventBadges } from "@/lib/events";
import { getServerClient } from "@/lib/dangolDb";
import AppHeader from "@/app/components/AppHeader";

export default async function OwnerDashboardPage() {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") redirect("/login");

  const db = getServerClient();

  const [monthly, consent, effect, cards, sendChRow, storeLinkRow, eventBadges] = await Promise.all([
    monthlyStats(ctx.storeLinkId),
    consentRate(ctx.storeLinkId),
    messageEffect(ctx.storeLinkId),
    todayCards(ctx.storeLinkId),
    db
      .from("send_channels")
      .select("setup_step, connected")
      .eq("store_link_id", ctx.storeLinkId)
      .maybeSingle(),
    db
      .from("store_links")
      .select("store_code")
      .eq("id", ctx.storeLinkId)
      .maybeSingle(),
    getEventBadges(db, ctx.storeLinkId),
  ]);

  const sendChannel = (sendChRow.data as { setup_step: number; connected: boolean } | null) ?? {
    setup_step: 0,
    connected: false,
  };

  const storeCode = (storeLinkRow.data as { store_code: string } | null)?.store_code ?? null;
  const qrHref = storeCode ? `/api/qr?code=${storeCode}` : "/settings";

  const isEmpty = monthly.newCustomers === 0 && monthly.cumulativeRegulars === 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="owner" activeItem="대시보드" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>대시보드</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* First-customer banner — shown only when no data yet */}
          {isEmpty && (
            <div style={{ background: '#e1f5ee', border: '1px solid #9fe1cb', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>🏪 첫 손님을 받아보세요</p>
                <p style={{ fontSize: 12, color: '#5f5e5a' }}>QR 코드를 출력해 카운터에 붙여두세요</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link href={qrHref} style={{ background: '#0f6e56', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>QR 다운로드</Link>
                <Link href="/settings" style={{ fontSize: 12, color: '#888780', textDecoration: 'underline' }}>매장 설정</Link>
              </div>
            </div>
          )}

          {/* Event badge — hidden when no active events and no participation today */}
          {(eventBadges.activeEventCount > 0 || eventBadges.todayParticipationCount > 0) && (
            <Link
              href="/events"
              style={{ background: '#e1f5ee', border: '1px solid #9fe1cb', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>
                🎯 진행 중 이벤트 {eventBadges.activeEventCount}건 · 오늘 이벤트 참여 {eventBadges.todayParticipationCount}명
              </p>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#085041' }}>이벤트 관리 →</span>
            </Link>
          )}

          {/* 6 KPI stat cards — always visible */}
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
              <p style={{ fontSize: 14, color: '#5f5e5a' }}>이번 달 적립 스탬프</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#085041' }}>{monthly.monthlyStamps}</p>
              <p style={{ fontSize: 12, color: '#888780' }}>개</p>
            </div>
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
        </div>
      </main>
    </div>
  );
}
