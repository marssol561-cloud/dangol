"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import Input from "@/app/components/ui/Input";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

type Result = { valid: true } | { valid: false; reason: string } | null;

const REASON_MSG: Record<string, string> = {
  not_found: "존재하지 않는 쿠폰 코드입니다.",
  already_used: "이미 사용된 쿠폰입니다.",
  expired: "만료된 쿠폰입니다.",
};

interface PendingItem {
  participationId: string;
  customerLabel: string;
  eventTitle: string;
  condition: string | null;
  createdAt: string;
}

const PENDING_POLL_MS = 10000;

export default function CouponUsePage() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const [pending, setPending] = useState<PendingItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/events/pending");
      if (res.ok) {
        const data = await res.json();
        setPending(data.pending ?? []);
      }
    } catch {
      // 폴링이므로 다음 주기에 재시도 — 조용히 무시
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling loader on mount
    loadPending();
    const interval = setInterval(loadPending, PENDING_POLL_MS);
    return () => clearInterval(interval);
  }, [loadPending]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleApprove(participationId: string) {
    setActingId(participationId);
    try {
      const res = await fetch("/api/events/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participationId }),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.participationId !== participationId));
        setToast("쿠폰 발급·발송됨");
      } else {
        setToast("승인 처리에 실패했습니다.");
      }
    } catch {
      setToast("네트워크 오류가 발생했습니다.");
    } finally {
      setActingId(null);
    }
  }

  async function handleCancel(participationId: string) {
    setActingId(participationId);
    try {
      const res = await fetch("/api/events/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participationId }),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.participationId !== participationId));
      } else {
        setToast("취소 처리에 실패했습니다.");
      }
    } catch {
      setToast("네트워크 오류가 발생했습니다.");
    } finally {
      setActingId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/coupons/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      setResult(data);
      if (data.valid) setCode("");
    } catch {
      setResult({ valid: false, reason: "네트워크 오류가 발생했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="스탬프·쿠폰" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-[#888780] text-sm">← 홈</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">쿠폰 사용 처리</h1>
        </div>

        {toast && (
          <div
            style={{ maxWidth: 560, marginBottom: 16, background: '#0f6e56', color: '#fff', borderRadius: 8, padding: '10px 16px', fontSize: 14 }}
          >
            {toast}
          </div>
        )}

        <div style={{ maxWidth: 560, marginBottom: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="text-lg font-semibold text-[#2c2c2a]">이벤트 승인 대기</h2>
            {pendingLoading ? (
              <p className="text-sm text-[#888780]">불러오는 중...</p>
            ) : pending.length === 0 ? (
              <p className="text-sm text-[#888780]">대기 중인 참여가 없습니다.</p>
            ) : (
              pending.map((p) => (
                <div
                  key={p.participationId}
                  style={{ border: '1px solid #e5e5e0', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <p className="text-sm text-[#2c2c2a]"><strong>고객</strong> {p.customerLabel}</p>
                  <p className="text-sm text-[#2c2c2a]"><strong>이벤트</strong> {p.eventTitle}</p>
                  <p className="text-sm text-[#5f5e5a]"><strong>확인 조건</strong> {p.condition ?? "-"}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={actingId === p.participationId}
                      onClick={() => handleApprove(p.participationId)}
                      style={{ background: '#0f6e56', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      className="disabled:opacity-60"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={actingId === p.participationId}
                      onClick={() => handleCancel(p.participationId)}
                      style={{ background: '#fff', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      className="disabled:opacity-60"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ maxWidth: 560 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p className="text-sm text-[#5f5e5a]">고객의 쿠폰 코드를 입력하고 확인하세요.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                type="text"
                placeholder="쿠폰 코드 (예: ABC12345)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={20}
                required
                className="text-[18px] font-mono tracking-widest uppercase"
              />
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "확인 중..." : "쿠폰 확인"}
              </PrimaryButton>
            </form>

            {result !== null && (
              <div style={{ borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8, background: result.valid ? '#e1f5ee' : '#fff0f0', border: result.valid ? '1px solid #9fe1cb' : '2px solid #d32f2f' }}>
                {result.valid ? (
                  <>
                    <p className="text-lg font-bold text-[#085041]">✅ 쿠폰 사용 완료</p>
                    <p className="text-sm text-[#085041]">정상 처리되었습니다.</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-[#d32f2f]">❌ 사용 불가</p>
                    <p className="text-sm text-[#5f5e5a]">
                      {REASON_MSG[(result as { valid: false; reason: string }).reason] ??
                        (result as { valid: false; reason: string }).reason}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
