"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 text-sm">← 대시보드</Link>
        <h1 className="text-lg font-bold text-gray-900">C3 통합 고객 (3자 동의)</h1>
        <span className="ml-auto text-xs text-gray-400">{data?.total ?? 0}명</span>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {exporting ? "내보내는 중..." : "CSV 내보내기"}
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-12">불러오는 중...</p>
        ) : customers.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">통합 고객이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-gray-500">{c.identifier_hash.slice(0, 16)}…</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    매장 {c.store_count}곳 · 최초 {new Date(c.first_seen_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
                  {c.store_count}개 매장
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
