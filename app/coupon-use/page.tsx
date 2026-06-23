"use client";

import Link from "next/link";
import { useState } from "react";
import AppHeader from "@/app/components/AppHeader";

type Result = { valid: true } | { valid: false; reason: string } | null;

const REASON_MSG: Record<string, string> = {
  not_found: "존재하지 않는 쿠폰 코드입니다.",
  already_used: "이미 사용된 쿠폰입니다.",
  expired: "만료된 쿠폰입니다.",
};

export default function CouponUsePage() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

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

        <div className="max-w-[480px]">
          <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 flex flex-col gap-4">
            <p className="text-sm text-[#5f5e5a]">고객의 쿠폰 코드를 입력하고 확인하세요.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="쿠폰 코드 (예: ABC12345)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={20}
                required
                className="bg-white border border-[#e5e5e0] rounded-lg px-4 py-3.5 text-[18px] font-mono tracking-widest text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors w-full uppercase"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-[#0f6e56] text-white font-semibold text-[15px] rounded-lg py-3.5 w-full cursor-pointer disabled:opacity-60"
              >
                {submitting ? "확인 중..." : "쿠폰 확인"}
              </button>
            </form>

            {result !== null && (
              <div className={`rounded-xl p-5 flex flex-col gap-2 ${result.valid ? "bg-[#e1f5ee] border border-[#9fe1cb]" : "bg-[#fff0f0] border-2 border-[#d32f2f]"}`}>
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
