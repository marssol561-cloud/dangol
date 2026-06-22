"use client";

import { useState } from "react";

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
    <main style={s.page}>
      <h1 style={s.title}>쿠폰 사용 처리</h1>
      <p style={s.muted}>고객의 쿠폰 코드를 입력하고 확인하세요.</p>

      <form onSubmit={handleSubmit} style={s.form}>
        <input
          style={s.input}
          type="text"
          placeholder="쿠폰 코드 (예: ABC12345)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          maxLength={20}
          required
        />
        <button
          type="submit"
          style={{ ...s.btn, opacity: submitting ? 0.6 : 1 }}
          disabled={submitting}
        >
          {submitting ? "확인 중..." : "쿠폰 확인"}
        </button>
      </form>

      {result !== null && (
        <div style={{ ...s.resultBox, ...(result.valid ? s.resultOk : s.resultFail) }}>
          {result.valid ? (
            <>
              <p style={s.resultTitle}>✅ 쿠폰 사용 완료</p>
              <p style={s.muted}>정상 처리되었습니다.</p>
            </>
          ) : (
            <>
              <p style={s.resultTitle}>❌ 사용 불가</p>
              <p style={s.muted}>
                {REASON_MSG[(result as { valid: false; reason: string }).reason] ??
                  (result as { valid: false; reason: string }).reason}
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: "0 auto", padding: "40px 24px", fontFamily: "sans-serif", display: "flex", flexDirection: "column", gap: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: { padding: "14px 16px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 18, letterSpacing: 3, textTransform: "uppercase", boxSizing: "border-box" as const },
  btn: { padding: "14px 0", borderRadius: 10, border: "none", background: "#008080", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  resultBox: { borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 8 },
  resultOk: { background: "#e6f7e6", border: "2px solid #008000" },
  resultFail: { background: "#fff0f0", border: "2px solid #c00" },
  resultTitle: { fontSize: 18, fontWeight: 700, margin: 0 },
};
