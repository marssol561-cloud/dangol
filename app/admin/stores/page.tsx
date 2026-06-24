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
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="매장" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>매장(점주) 관리</h1>
          <span style={{ fontSize: 12, color: '#888780' }}>{storeList.length}개 매장</span>
        </div>

        {storeList.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: '#888780', paddingTop: 48 }}>등록된 매장이 없습니다</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ background: '#f8f7f4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 2 }}>매장명</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 60 }}>상태</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 60 }}>고객 수</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>이번달 발송</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>최근 활동</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 48 }}>상세</span>
            </div>
            {storeList.map((s) => (
              <div key={s.id} style={{ background: '#fff', borderTop: '1px solid #e5e5e0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 2 }}>
                  <p style={{ fontSize: 14, color: '#2c2c2a' }}>{s.store_name ?? "-"}</p>
                  <p style={{ fontSize: 12, color: '#888780' }}>{s.store_code}</p>
                </div>
                <span style={{ fontSize: 14, color: '#2c2c2a', width: 60 }}>활성</span>
                <span style={{ fontSize: 14, color: '#2c2c2a', width: 60 }}>{(countsMap[s.id] ?? 0).toLocaleString()}</span>
                <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{(sentMap[s.id] ?? 0).toLocaleString()}건</span>
                <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{new Date(s.created_at).toLocaleDateString("ko-KR")}</span>
                <Link href={`/admin/stores/${s.id}`} style={{ fontSize: 14, color: '#0f6e56', textDecoration: 'none', width: 48 }}>보기 &gt;</Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
