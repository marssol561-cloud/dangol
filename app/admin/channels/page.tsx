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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="채널 연결" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#888780] text-sm">← 대시보드</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">채널 모니터링</h1>
          {supportTargets.length > 0 && (
            <span className="ml-auto bg-[#fff0f0] text-[#d32f2f] text-xs px-2 py-0.5 rounded-full border border-[#d32f2f]/30">
              지원 대상 {supportTargets.length}개
            </span>
          )}
        </div>

        <div className="max-w-3xl flex flex-col gap-6">
          {/* Support targets */}
          {supportTargets.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#d32f2f] mb-3">⚠ 미완료 설정 (support 대상)</h2>
              <div className="flex flex-col gap-2">
                {supportTargets.map((s) => {
                  const ch = channelMap[s.id];
                  return (
                    <div key={s.id} className="bg-[#fff0f0] border border-[#d32f2f]/20 rounded-xl px-5 py-3">
                      <p className="text-sm font-medium text-[#d32f2f]">{s.store_name ?? "-"}</p>
                      <p className="text-xs text-[#d32f2f]/70 mt-0.5">
                        {s.store_code} · setup_step {ch?.setup_step ?? 0}/4
                        {ch ? ` · ${ch.provider}` : " · 채널 없음"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* All stores */}
          <section>
            <h2 className="text-sm font-semibold text-[#5f5e5a] mb-3">전체 매장 채널 상태</h2>
            {storeList.length === 0 ? (
              <p className="text-sm text-[#888780]">매장 없음</p>
            ) : (
              <div className="flex flex-col gap-2">
                {storeList.map((s) => {
                  const ch = channelMap[s.id];
                  const isComplete = ch && ch.setup_step >= 4;
                  return (
                    <div key={s.id} className="bg-white border border-[#e5e5e0] rounded-xl px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#2c2c2a]">{s.store_name ?? "-"}</p>
                        <p className="text-xs text-[#888780]">{s.store_code}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {ch ? (
                          <>
                            <span className="text-xs text-[#888780]">{ch.provider} · step {ch.setup_step}/4</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isComplete ? "bg-[#e1f5ee] text-[#085041]" : "bg-[#faeeda] text-[#633806]"}`}>
                              {ch.connected ? "연결됨" : "미연결"}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs bg-[#f8f7f4] text-[#888780] px-2 py-0.5 rounded-full border border-[#e5e5e0]">미설정</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
