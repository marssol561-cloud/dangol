"use client";

import { useEffect, useState } from "react";

interface StampsPolicy {
  required_count: number;
  reward_desc: string | null;
  service_a: string | null;
  service_b: string | null;
  service_c: string | null;
}

const DEFAULT: StampsPolicy = {
  required_count: 10,
  reward_desc: null,
  service_a: null,
  service_b: null,
  service_c: null,
};

export default function StampsPage() {
  const [policy, setPolicy] = useState<StampsPolicy>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stamps-rewards")
      .then((r) => r.json())
      .then((d) => {
        if (d.required_count !== undefined) setPolicy(d);
      })
      .catch(() => setError("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/stamps-rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "저장 실패");
        return;
      }
      setSaved(true);
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main style={s.page}><p style={s.muted}>불러오는 중...</p></main>;

  return (
    <main style={s.page}>
      <h1 style={s.title}>스탬프 정책 설정</h1>
      <form onSubmit={handleSave} style={s.form}>
        <label style={s.label}>
          리워드 기준 스탬프 수
          <input
            style={s.input}
            type="number"
            min={1}
            max={100}
            value={policy.required_count}
            onChange={(e) => setPolicy({ ...policy, required_count: Number(e.target.value) })}
            required
          />
        </label>

        <label style={s.label}>
          리워드 설명
          <input
            style={s.input}
            type="text"
            placeholder="예: 아메리카노 1잔 무료"
            value={policy.reward_desc ?? ""}
            onChange={(e) => setPolicy({ ...policy, reward_desc: e.target.value || null })}
          />
        </label>

        <label style={s.label}>
          첫 방문 쿠폰 혜택 (A)
          <input
            style={s.input}
            type="text"
            placeholder="예: 첫 방문 10% 할인"
            value={policy.service_a ?? ""}
            onChange={(e) => setPolicy({ ...policy, service_a: e.target.value || null })}
          />
        </label>

        <label style={s.label}>
          재방문 쿠폰 혜택 (B)
          <input
            style={s.input}
            type="text"
            placeholder="예: 재방문 음료 1+1"
            value={policy.service_b ?? ""}
            onChange={(e) => setPolicy({ ...policy, service_b: e.target.value || null })}
          />
        </label>

        <label style={s.label}>
          친구 추천 쿠폰 혜택 (C)
          <input
            style={s.input}
            type="text"
            placeholder="예: 친구 추천 500원 할인"
            value={policy.service_c ?? ""}
            onChange={(e) => setPolicy({ ...policy, service_c: e.target.value || null })}
          />
        </label>

        {error && <p style={s.error}>{error}</p>}
        {saved && <p style={s.success}>저장되었습니다.</p>}

        <button type="submit" style={{ ...s.btn, opacity: saving ? 0.6 : 1 }} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: "0 auto", padding: "40px 24px", fontFamily: "sans-serif", display: "flex", flexDirection: "column", gap: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 },
  input: { padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 15, boxSizing: "border-box" as const },
  btn: { padding: "14px 0", borderRadius: 10, border: "none", background: "#008080", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  error: { color: "#c00", fontSize: 14, margin: 0 },
  success: { color: "#008000", fontSize: 14, margin: 0 },
};
