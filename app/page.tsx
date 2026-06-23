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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">대시보드</h1>
        </div>

        {isEmpty ? (
          <EmptyState storeLinkId={ctx.storeLinkId} />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Monthly stats card */}
            <div className="bg-white border border-[#e5e5e0] rounded-xl p-6">
              <p className="text-xs text-[#888780] mb-4">이번 달</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <Link href="/customers?filter=new" className="group">
                  <p className="text-3xl font-bold text-[#0f6e56]">{monthly.newCustomers}</p>
                  <p className="text-xs text-[#5f5e5a] mt-1">신규</p>
                </Link>
                <Link href="/customers?filter=returning" className="group">
                  <p className="text-3xl font-bold text-[#0f6e56]">{monthly.returningVisits}</p>
                  <p className="text-xs text-[#5f5e5a] mt-1">재방문</p>
                </Link>
                <div>
                  <p className="text-3xl font-bold text-[#0f6e56]">
                    {Math.round(monthly.returnRate * 100)}%
                  </p>
                  <p className="text-xs text-[#5f5e5a] mt-1">재방문율</p>
                </div>
              </div>
            </div>

            {/* Cumulative + consent card */}
            <div className="bg-white border border-[#e5e5e0] rounded-xl p-6">
              <div className="grid grid-cols-2 gap-6">
                <Link href="/customers" className="block">
                  <p className="text-xs text-[#888780]">누적 단골 이상</p>
                  <p className="text-2xl font-bold text-[#2c2c2a] mt-1">
                    {monthly.cumulativeRegulars}
                    <span className="text-sm font-normal text-[#5f5e5a] ml-1">명</span>
                  </p>
                </Link>
                <div>
                  <p className="text-xs text-[#888780]">광고 동의율</p>
                  <p className="text-2xl font-bold text-[#2c2c2a] mt-1">
                    {Math.round(consent.rate * 100)}%
                  </p>
                  <p className="text-xs text-[#888780] mt-0.5">
                    {consent.consented}/{consent.total}명
                  </p>
                </div>
              </div>
            </div>

            {/* Message effect banner */}
            {effect.revisitCount > 0 && (
              <div className="bg-[#e1f5ee] border border-[#9fe1cb] rounded-xl px-5 py-3 flex items-center gap-2">
                <span className="text-lg">📨</span>
                <p className="text-sm text-[#085041]">
                  소식 받고 다시 온 단골{" "}
                  <strong className="font-bold">{effect.revisitCount}명</strong>
                </p>
              </div>
            )}

            {/* Today action cards */}
            {cards.some((c) => c.count > 0) && (
              <div>
                <p className="text-xs text-[#888780] mb-3">오늘 액션</p>
                <div className="flex flex-col gap-2">
                  {cards.filter((c) => c.count > 0).map((card: TodayCard) => (
                    <Link
                      key={card.segment}
                      href={`/messages?segment=${card.segment}`}
                      className="flex items-center justify-between bg-white border border-[#e5e5e0] rounded-xl px-5 py-4"
                    >
                      <span className="text-sm text-[#2c2c2a]">{card.label}</span>
                      <span className="text-[#0f6e56] font-semibold text-sm">
                        {card.count}명 →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Send channel status */}
        <div className="text-center mt-6">
          {sendChannel.connected ? (
            <p className="text-xs text-[#888780]">✓ 소식 발송 연결됨</p>
          ) : (
            <Link href="/send-setup" className="text-xs text-[#ef9f27] underline">
              소식 발송 설정하기 ({sendChannel.setup_step}/4단계 완료)
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ storeLinkId }: { storeLinkId: string }) {
  void storeLinkId;
  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl p-10 text-center">
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
