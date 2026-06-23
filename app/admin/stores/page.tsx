import { getSessionUser } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/admin";
import { getServerClient } from "@/lib/dangolDb";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="매장" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#888780] text-sm">← 대시보드</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">매장</h1>
          <span className="ml-auto text-xs text-[#888780]">{storeList.length}개 매장</span>
        </div>

        <div className="max-w-3xl">
          {storeList.length === 0 ? (
            <p className="text-center text-sm text-[#888780] py-12">등록된 매장이 없습니다</p>
          ) : (
            <div className="flex flex-col gap-3">
              {storeList.map((s) => (
                <div key={s.id} style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:'16px 20px' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-[#2c2c2a]">{s.store_name ?? "-"}</p>
                      <p className="text-xs text-[#888780] mt-0.5">{s.store_code} · {s.address ?? "-"}</p>
                    </div>
                    <span className="text-xs text-[#888780] shrink-0">
                      {new Date(s.created_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex gap-6 mt-3">
                    <div>
                      <p className="text-xs text-[#888780]">고객 수</p>
                      <p className="text-lg font-bold text-[#2c2c2a]">{(countsMap[s.id] ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#888780]">발송 수</p>
                      <p className="text-lg font-bold text-[#2c2c2a]">{(sentMap[s.id] ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
