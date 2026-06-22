import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerContext } from "@/lib/ownerAuth";
import { monthlyStats, consentRate, messageEffect, todayCards, type TodayCard } from "@/lib/dashboard";
import { getServerClient } from "@/lib/dangolDb";

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
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">리붐단골</h1>
        <Link href="/settings" className="text-sm text-gray-500">설정</Link>
      </header>

      <div className="max-w-xl mx-auto px-4 pt-6 space-y-5">
        {isEmpty ? (
          <EmptyState storeLinkId={ctx.storeLinkId} />
        ) : (
          <>
            {/* Monthly stats */}
            <section className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-gray-400 mb-3">이번 달</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Link href="/customers?filter=new" className="group">
                  <p className="text-3xl font-bold text-teal-600">{monthly.newCustomers}</p>
                  <p className="text-xs text-gray-500 mt-1">신규</p>
                </Link>
                <Link href="/customers?filter=returning" className="group">
                  <p className="text-3xl font-bold text-teal-600">{monthly.returningVisits}</p>
                  <p className="text-xs text-gray-500 mt-1">재방문</p>
                </Link>
                <div>
                  <p className="text-3xl font-bold text-teal-600">
                    {Math.round(monthly.returnRate * 100)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">재방문율</p>
                </div>
              </div>
            </section>

            {/* Cumulative + consent */}
            <section className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <Link href="/customers" className="block">
                  <p className="text-xs text-gray-400">누적 단골 이상</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {monthly.cumulativeRegulars}
                    <span className="text-sm font-normal text-gray-500 ml-1">명</span>
                  </p>
                </Link>
                <div>
                  <p className="text-xs text-gray-400">광고 동의율</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {Math.round(consent.rate * 100)}%
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {consent.consented}/{consent.total}명
                  </p>
                </div>
              </div>
            </section>

            {/* Message effect */}
            {effect.revisitCount > 0 && (
              <div className="bg-teal-50 rounded-2xl px-5 py-3 flex items-center gap-2">
                <span className="text-lg">📨</span>
                <p className="text-sm text-teal-700">
                  소식 받고 다시 온 단골{" "}
                  <strong className="text-teal-800">{effect.revisitCount}명</strong>
                </p>
              </div>
            )}

            {/* Today cards */}
            {cards.some((c) => c.count > 0) && (
              <section>
                <p className="text-xs text-gray-400 mb-2 px-1">오늘 액션</p>
                <div className="space-y-2">
                  {cards.filter((c) => c.count > 0).map((card: TodayCard) => (
                    <Link
                      key={card.segment}
                      href={`/messages?segment=${card.segment}`}
                      className="flex items-center justify-between bg-white rounded-2xl px-5 py-4 shadow-sm"
                    >
                      <span className="text-sm text-gray-700">{card.label}</span>
                      <span className="text-teal-600 font-semibold text-sm">
                        {card.count}명 →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Send channel status */}
        <div className="text-center pt-2">
          {sendChannel.connected ? (
            <p className="text-xs text-gray-400">✓ 소식 발송 연결됨</p>
          ) : (
            <Link href="/send-setup" className="text-xs text-amber-500 underline">
              소식 발송 설정하기 ({sendChannel.setup_step}/4단계 완료)
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function EmptyState({ storeLinkId }: { storeLinkId: string }) {
  void storeLinkId;
  return (
    <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
      <p className="text-4xl mb-4">🏪</p>
      <p className="text-lg font-semibold text-gray-700 mb-2">첫 손님을 받아보세요</p>
      <p className="text-sm text-gray-400 mb-6">QR 코드를 출력해 카운터에 붙여두세요</p>
      <Link
        href="/api/qr"
        className="inline-block bg-teal-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium"
      >
        QR PDF 다운로드
      </Link>
      <p className="mt-4">
        <Link href="/settings" className="text-xs text-gray-400 underline">
          매장 설정
        </Link>
      </p>
    </div>
  );
}
