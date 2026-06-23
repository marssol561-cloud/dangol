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

  const CHANNEL_LABELS: Record<string, string> = {
    kakao: "알림톡",
    phone: "문자(SMS)",
    email: "이메일",
  };

  const MAIN_CHANNELS = ["kakao", "phone", "email"];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="발송·비용" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>발송·비용 모니터링</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 3 channel stat cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {MAIN_CHANNELS.map((ch) => {
              const stat = aggMap[ch] ?? { sent: 0, failed: 0, pending: 0 };
              const total = stat.sent + stat.failed;
              const successRate = total > 0 ? ((stat.sent / total) * 100).toFixed(1) : "—";
              return (
                <div key={ch} style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, width: 384, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <p style={{ fontSize: 14, color: '#5f5e5a' }}>{CHANNEL_LABELS[ch] ?? ch}</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color: '#085041' }}>{stat.sent.toLocaleString()}건</p>
                  <p style={{ fontSize: 12, color: '#888780' }}>성공 {successRate}%</p>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 12, color: '#888780' }}>
            ※ 성공/실패는 솔라피 웹훅 콜백으로 갱신. 발송비는 점주 부담(솔라피 충전).
          </p>

          {/* Send channel list */}
          {sendCh.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: '#f8f7f4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 2 }}>제공사</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 100 }}>발신번호</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>진행 단계</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 60 }}>상태</span>
              </div>
              {sendCh.map((sc) => (
                <div key={sc.store_link_id} style={{ background: '#fff', borderTop: '1px solid #e5e5e0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 14, color: '#2c2c2a', flex: 2 }}>{sc.provider}</span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', width: 100 }}>{sc.sender_number ?? "—"}</span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{sc.setup_step}/4</span>
                  <span style={{ fontSize: 12, background: sc.connected ? '#e1f5ee' : '#f8f7f4', color: sc.connected ? '#085041' : '#888780', borderRadius: 999, padding: '4px 10px', width: 60, textAlign: 'center' }}>
                    {sc.connected ? "연결됨" : "미연결"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
