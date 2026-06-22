"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

type Segment = "grade_vip" | "grade_regular" | "grade_normal" | "churn" | "anniversary";
type TemplateId = "coupon_issued" | "stamp_reward" | "returning_reminder" | "churn_reengage" | "anniversary";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "grade_vip", label: "VIP 고객" },
  { value: "grade_regular", label: "단골 고객" },
  { value: "grade_normal", label: "일반 고객" },
  { value: "churn", label: "장기 미방문 (60일+)" },
  { value: "anniversary", label: "기념일 고객" },
];

const TEMPLATES: { value: TemplateId; label: string }[] = [
  { value: "coupon_issued", label: "쿠폰 발급 안내" },
  { value: "stamp_reward", label: "스탬프 리워드" },
  { value: "returning_reminder", label: "재방문 안내" },
  { value: "churn_reengage", label: "이탈 고객 재유입" },
  { value: "anniversary", label: "기념일 메시지" },
];

function parseSegmentParam(s: string | null): { segment: Segment | null; segmentType: string; grade?: string } {
  if (!s) return { segment: null, segmentType: "grade" };
  if (s.startsWith("grade_")) return { segment: s as Segment, segmentType: "grade", grade: s.replace("grade_", "") };
  if (s === "churn") return { segment: "churn", segmentType: "churn" };
  if (s === "anniversary") return { segment: "anniversary", segmentType: "anniversary" };
  return { segment: null, segmentType: "grade" };
}

function MessagesPageInner() {
  const searchParams = useSearchParams();
  const initSegment = parseSegmentParam(searchParams.get("segment"));
  const initTemplate = (searchParams.get("template") as TemplateId) || null;

  const [storeLinkId, setStoreLinkId] = useState<string>("");
  const [segment, setSegment] = useState<Segment | "">(initSegment.segment ?? "");
  const [templateId, setTemplateId] = useState<TemplateId | "">(initTemplate ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent?: number; failed?: number; skipped?: number; error?: string } | null>(null);

  const db = createBrowserClient(
    process.env.NEXT_PUBLIC_DANGOL_DB_URL!,
    process.env.NEXT_PUBLIC_DANGOL_DB_ANON_KEY!
  );

  useEffect(() => {
    db.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      db.from("store_links").select("id").eq("owner_id", session.user.id).limit(1).single()
        .then(({ data }) => { if (data) setStoreLinkId(data.id); });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    if (!storeLinkId || !segment || !templateId) return;
    setSending(true);
    setResult(null);

    const { data: { session } } = await db.auth.getSession();
    if (!session) { setResult({ error: "로그인 필요" }); setSending(false); return; }

    const [segmentType, grade] = segment.startsWith("grade_")
      ? ["grade", segment.replace("grade_", "")]
      : [segment, undefined];

    const resp = await fetch("/api/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        store_link_id: storeLinkId,
        segment: segmentType,
        template_id: templateId,
        template_vars: grade ? { grade } : {},
      }),
    });

    const json = await resp.json();
    setResult(json);
    setSending(false);
  }

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>메시지 발송</h1>

      <section style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>고객 세그먼트</label>
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value as Segment)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc" }}
        >
          <option value="">-- 선택 --</option>
          {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </section>

      <section style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>메시지 템플릿</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value as TemplateId)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc" }}
        >
          <option value="">-- 선택 --</option>
          {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </section>

      <div style={{ padding: "12px 16px", background: "#f0f7ff", borderRadius: 6, marginBottom: 20, fontSize: 13, color: "#555" }}>
        * 광고 수신 동의 고객에게만 발송됩니다. 21:00–08:00 KST 야간 발송은 차단됩니다.
      </div>

      <button
        onClick={handleSend}
        disabled={sending || !segment || !templateId}
        style={{
          background: sending ? "#aaa" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: 600,
          cursor: sending ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {sending ? "발송 중..." : "메시지 발송"}
      </button>

      {result && (
        <div style={{
          marginTop: 20,
          padding: "16px",
          background: result.error ? "#fff0f0" : "#f0fff4",
          borderRadius: 8,
          border: `1px solid ${result.error ? "#f99" : "#86efac"}`,
        }}>
          {result.error ? (
            <p style={{ color: "#c00", margin: 0 }}>오류: {result.error}</p>
          ) : (
            <>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>발송 완료</p>
              <p style={{ margin: 0, fontSize: 14 }}>성공 {result.sent ?? 0}건 / 실패 {result.failed ?? 0}건 / 건너뜀 {result.skipped ?? 0}건</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesPageInner />
    </Suspense>
  );
}
