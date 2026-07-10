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
    <div style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <AppHeader variant="admin" activeItem="통합 고객" />

      <main style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>통합 고객 데이터</h1>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{ background: '#0f6e56', color: '#fff', fontWeight: 600, fontSize: 14, borderRadius: 8, padding: '12px 20px', border: 'none', cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}
            >
              {exporting ? "내보내는 중..." : "내보내기 (감사로그 기록)"}
            </button>
          </div>

          <p style={{ fontSize: 13, color: '#5f5e5a' }}>
            점포 간 동일인을 통합고객 1명으로 묶어 별도 관리 (동의 기반) · {data?.total ?? 0}명
          </p>

          {/* Customer table */}
          {loading ? (
            <p style={{ textAlign: 'center', fontSize: 14, color: '#888780', paddingTop: 48 }}>불러오는 중...</p>
          ) : customers.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 14, color: '#888780', paddingTop: 48 }}>통합 고객이 없습니다</p>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: '#f8f7f4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 2 }}>통합고객</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>연결 매장</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 80 }}>등급</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 100 }}>동의</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', width: 60 }}>활용</span>
              </div>
              {customers.map((c) => (
                <div key={c.id} style={{ background: '#fff', borderTop: '1px solid #e5e5e0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 2 }}>
                    <p style={{ fontSize: 14, color: '#2c2c2a', fontFamily: 'monospace' }}>{c.identifier_hash.slice(0, 12)}…</p>
                    <p style={{ fontSize: 12, color: '#888780' }}>최초 {new Date(c.first_seen_at).toLocaleDateString("ko-KR")}</p>
                  </div>
                  <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>{c.store_count}개 매장</span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', width: 80 }}>일반</span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', width: 100 }}>
                    {c.channels ? "광고" : "미동의"}
                  </span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', width: 60 }}>
                    {c.store_count > 0 ? "가능" : "불가"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Audit log card */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#2c2c2a' }}>내보내기 감사 로그</p>
            <p style={{ fontSize: 13, color: '#5f5e5a' }}>내보내기 실행 시 자동 기록됩니다.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
