"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

interface UnifiedCustomer {
  id: string;
  identifier_hash: string;
  store_count: number;
  channels: Record<string, unknown> | null;
  first_seen_at: string;
}

interface ApiResponse {
  customers: UnifiedCustomer[];
  total: number;
}

export default function AdminCustomersPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    const res = await fetch("/api/admin/customers/export");
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unified_customers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  };

  const customers = data?.customers ?? [];

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="admin" activeItem="통합 고객" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#888780] text-sm">← 대시보드</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">통합 고객 (3자 동의)</h1>
          <span className="ml-auto text-xs text-[#888780]">{data?.total ?? 0}명</span>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-[#0f6e56] text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {exporting ? "내보내는 중..." : "CSV 내보내기"}
          </button>
        </div>

        <div className="max-w-3xl">
          {loading ? (
            <p className="text-center text-sm text-[#888780] py-12">불러오는 중...</p>
          ) : customers.length === 0 ? (
            <p className="text-center text-sm text-[#888780] py-12">통합 고객이 없습니다</p>
          ) : (
            <div className="flex flex-col gap-2">
              {customers.map((c) => (
                <div key={c.id} className="bg-white border border-[#e5e5e0] rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-[#888780]">{c.identifier_hash.slice(0, 16)}…</p>
                    <p className="text-xs text-[#888780] mt-0.5">
                      매장 {c.store_count}곳 · 최초 {new Date(c.first_seen_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <span className="text-xs bg-[#e1f5ee] text-[#085041] px-2 py-0.5 rounded-full">
                    {c.store_count}개 매장
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
