import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";

export default async function AdminStoresPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await requireAdmin(user.id);

  const db = getServerClient();

  const { data: stores } = await db
    .from("store_links")
    .select("id, store_code, store_name, address, created_at")
    .order("created_at", { ascending: false });

  const storeList = (stores ?? []) as {
    id: string;
    store_code: string;
    store_name: string | null;
    address: string | null;
    created_at: string;
  }[];

  // Get per-store customer counts
  const storeIds = storeList.map((s) => s.id);
  const countsMap: Record<string, number> = {};

  if (storeIds.length > 0) {
    const { data: counts } = await db
      .from("customers")
      .select("store_link_id")
      .in("store_link_id", storeIds);

    for (const row of (counts ?? []) as { store_link_id: string }[]) {
      countsMap[row.store_link_id] = (countsMap[row.store_link_id] ?? 0) + 1;
    }
  }

  // Get per-store sent message counts
  const sentMap: Record<string, number> = {};
  if (storeIds.length > 0) {
    const { data: msgs } = await db
      .from("messages")
      .select("store_link_id")
      .in("store_link_id", storeIds)
      .eq("status", "sent");

    for (const row of (msgs ?? []) as { store_link_id: string }[]) {
      sentMap[row.store_link_id] = (sentMap[row.store_link_id] ?? 0) + 1;
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 text-sm">← 대시보드</Link>
        <h1 className="text-lg font-bold text-gray-900">C2 매장 목록</h1>
        <span className="ml-auto text-xs text-gray-400">{storeList.length}개 매장</span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {storeList.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">등록된 매장이 없습니다</p>
        ) : (
          <div className="space-y-3">
            {storeList.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{s.store_name ?? "-"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.store_code} · {s.address ?? "-"}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(s.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <div className="flex gap-6 mt-3">
                  <div>
                    <p className="text-xs text-gray-400">고객 수</p>
                    <p className="text-lg font-bold text-gray-900">{(countsMap[s.id] ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">발송 수</p>
                    <p className="text-lg font-bold text-gray-900">{(sentMap[s.id] ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
