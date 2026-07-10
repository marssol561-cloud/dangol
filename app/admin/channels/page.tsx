import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

export default async function AdminChannelsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const { data: stores } = await db
    .from("store_links")
    .select("id, store_name, store_code, owner_id")
    .order("created_at", { ascending: false });

  const storeList = (stores ?? []) as {
    id: string;
    store_name: string | null;
    store_code: string;
    owner_id: string;
  }[];

  const storeIds = storeList.map((s) => s.id);
  const channelMap: Record<
    string,
    { setup_step: number; connected: boolean; provider: string }
  > = {};

  if (storeIds.length > 0) {
    const { data: chs } = await db
      .from("send_channels")
      .select("store_link_id, setup_step, connected, provider")
      .in("store_link_id", storeIds);

    for (const c of (chs ?? []) as {
      store_link_id: string;
      setup_step: number;
      connected: boolean;
      provider: string;
    }[]) {
      channelMap[c.store_link_id] = c;
    }
  }

  const supportTargets = storeList.filter((s) => {
    const ch = channelMap[s.id];
    return !ch || ch.setup_step < 4;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="채널 연결" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>점주 채널 연결 모니터링</h1>
          <p style={{ fontSize: 13, color: '#5f5e5a' }}>점주별 발송 채널(A9) 연결 상태 · 미완료 점주 지원 대상</p>

          {storeList.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 14, color: '#888780', paddingTop: 48 }}>매장 없음</p>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: '#f8f7f4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 2 }}>매장명</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>카카오 채널</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>솔라피 연결</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>진행 단계</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 60 }}>상태</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 60 }}>지원</span>
              </div>
              {storeList.map((s) => {
                const ch = channelMap[s.id];
                const isComplete = ch && ch.setup_step >= 4;
                const needsSupport = !ch || ch.setup_step < 4;
                const kakaoConnected = ch?.provider === "kakao" && ch.connected;
                const solapiConnected = ch?.provider === "solapi" && ch.connected;
                return (
                  <div key={s.id} style={{ background: '#fff', borderTop: '1px solid #e5e5e0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 2 }}>
                      <p style={{ fontSize: 14, color: '#2c2c2a' }}>{s.store_name ?? "—"}</p>
                      <p style={{ fontSize: 12, color: '#888780' }}>{s.store_code}</p>
                    </div>
                    <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{kakaoConnected ? "완료" : "미완료"}</span>
                    <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{solapiConnected ? "완료" : ch && ch.setup_step > 1 ? "진행중" : "미완료"}</span>
                    <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{ch ? `${ch.setup_step}/4` : "0/4"}</span>
                    <span style={{ fontSize: 14, color: '#2c2c2a', width: 60 }}>{isComplete ? "정상" : needsSupport ? "막힘" : "대기"}</span>
                    <span style={{ fontSize: 14, width: 60 }}>
                      {needsSupport ? (
                        <Link href={`/admin/stores/${s.id}`} style={{ color: '#0f6e56', textDecoration: 'none' }}>지원 &gt;</Link>
                      ) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
