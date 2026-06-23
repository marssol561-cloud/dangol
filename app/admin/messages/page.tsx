import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

export default async function AdminMessagesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const [{ data: msgs }, { data: channels }] = await Promise.all([
    db.from("messages").select("channel, status"),
    db.from("send_channels").select("store_link_id, provider, sender_number, connected, setup_step"),
  ]);

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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="발송·비용" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#888780] text-sm">← 대시보드</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">발송 / 비용</h1>
        </div>

        <div className="max-w-3xl flex flex-col gap-6">
          {/* Send volume by channel */}
          <section>
            <h2 className="text-sm font-semibold text-[#5f5e5a] mb-3">채널별 발송 현황</h2>
            {channelRows.length === 0 ? (
              <p className="text-sm text-[#888780]">발송 내역 없음</p>
            ) : (
              <div className="flex flex-col gap-3">
                {channelRows.map(([ch, stat]) => (
                  <div key={ch} style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:'16px 20px' }}>
                    <p className="font-medium text-[#2c2c2a] capitalize mb-2">{ch}</p>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-xs text-[#888780]">성공</p>
                        <p className="text-lg font-bold text-[#085041]">{stat.sent}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#888780]">실패</p>
                        <p className="text-lg font-bold text-[#d32f2f]">{stat.failed}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#888780]">대기</p>
                        <p className="text-lg font-bold text-[#888780]">{stat.pending}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Send channels */}
          <section>
            <h2 className="text-sm font-semibold text-[#5f5e5a] mb-3">발송 채널 설정 현황</h2>
            {sendCh.length === 0 ? (
              <p className="text-sm text-[#888780]">설정된 채널 없음</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sendCh.map((sc) => (
                  <div key={sc.store_link_id} style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <p className="text-sm text-[#2c2c2a]">{sc.provider} · {sc.sender_number ?? "-"}</p>
                      <p className="text-xs text-[#888780]">setup_step: {sc.setup_step}/4</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sc.connected ? "bg-[#e1f5ee] text-[#085041]" : "bg-[#f8f7f4] text-[#888780]"}`}>
                      {sc.connected ? "연결됨" : "미연결"}
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
