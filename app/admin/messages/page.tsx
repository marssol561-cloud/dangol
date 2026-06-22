import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";

export default async function AdminMessagesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const [{ data: msgs }, { data: channels }] = await Promise.all([
    db.from("messages").select("channel, status"),
    db.from("send_channels").select("store_link_id, provider, sender_number, connected, setup_step"),
  ]);

  // Aggregate per channel × status
  const aggMap: Record<string, { sent: number; failed: number; pending: number }> = {};
  for (const m of (msgs ?? []) as { channel: string; status: string }[]) {
    if (!aggMap[m.channel]) aggMap[m.channel] = { sent: 0, failed: 0, pending: 0 };
    if (m.status === "sent") aggMap[m.channel].sent++;
    else if (m.status === "failed") aggMap[m.channel].failed++;
    else aggMap[m.channel].pending++;
  }

  const channelRows = Object.entries(aggMap);
  const sendCh = (channels ?? []) as {
    store_link_id: string;
    provider: string;
    sender_number: string | null;
    connected: boolean;
    setup_step: number;
  }[];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 text-sm">← 대시보드</Link>
        <h1 className="text-lg font-bold text-gray-900">C4 메시지 / 발송 비용</h1>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Send volume by channel */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">채널별 발송 현황</h2>
          {channelRows.length === 0 ? (
            <p className="text-sm text-gray-400">발송 내역 없음</p>
          ) : (
            <div className="space-y-3">
              {channelRows.map(([ch, stat]) => (
                <div key={ch} className="bg-white rounded-2xl shadow-sm px-5 py-4">
                  <p className="font-medium text-gray-800 capitalize">{ch}</p>
                  <div className="flex gap-6 mt-2">
                    <div>
                      <p className="text-xs text-gray-400">성공</p>
                      <p className="text-lg font-bold text-teal-600">{stat.sent}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">실패</p>
                      <p className="text-lg font-bold text-red-500">{stat.failed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">대기</p>
                      <p className="text-lg font-bold text-gray-400">{stat.pending}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Send channels (cost/balance) */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">발송 채널 설정 현황</h2>
          {sendCh.length === 0 ? (
            <p className="text-sm text-gray-400">설정된 채널 없음</p>
          ) : (
            <div className="space-y-2">
              {sendCh.map((sc) => (
                <div key={sc.store_link_id} className="bg-white rounded-2xl shadow-sm px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">{sc.provider} · {sc.sender_number ?? "-"}</p>
                    <p className="text-xs text-gray-400">setup_step: {sc.setup_step}/4</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${sc.connected ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                    {sc.connected ? "연결됨" : "미연결"}
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
