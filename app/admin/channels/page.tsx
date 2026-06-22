import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";

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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 text-sm">← 대시보드</Link>
        <h1 className="text-lg font-bold text-gray-900">C7 채널 모니터링</h1>
        {supportTargets.length > 0 && (
          <span className="ml-auto bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
            지원 대상 {supportTargets.length}개
          </span>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Support targets */}
        {supportTargets.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-red-600 mb-3">⚠ 미완료 설정 (support 대상)</h2>
            <div className="space-y-2">
              {supportTargets.map((s) => {
                const ch = channelMap[s.id];
                return (
                  <div key={s.id} className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3">
                    <p className="text-sm font-medium text-red-800">{s.store_name ?? "-"}</p>
                    <p className="text-xs text-red-500 mt-0.5">
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
          <h2 className="text-sm font-semibold text-gray-700 mb-3">전체 매장 채널 상태</h2>
          {storeList.length === 0 ? (
            <p className="text-sm text-gray-400">매장 없음</p>
          ) : (
            <div className="space-y-2">
              {storeList.map((s) => {
                const ch = channelMap[s.id];
                const isComplete = ch && ch.setup_step >= 4;
                return (
                  <div key={s.id} className="bg-white rounded-2xl shadow-sm px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.store_name ?? "-"}</p>
                      <p className="text-xs text-gray-400">{s.store_code}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {ch ? (
                        <>
                          <span className="text-xs text-gray-400">{ch.provider} · step {ch.setup_step}/4</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${isComplete ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-600"}`}>
                            {ch.connected ? "연결됨" : "미연결"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">미설정</span>
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
  );
}
