"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import AppHeader from "@/app/components/AppHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

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

const selectCls = "bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] outline-none focus:border-[#0f6e56] transition-colors w-full";

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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="소식 보내기" />

      <main className="flex-1 p-8">
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">소식 보내기</h1>

          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5f5e5a]">고객 세그먼트</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value as Segment)}
                className={selectCls}
              >
                <option value="">-- 선택 --</option>
                {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5f5e5a]">메시지 템플릿</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as TemplateId)}
                className={selectCls}
              >
                <option value="">-- 선택 --</option>
                {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="bg-[#f8f7f4] border border-[#e5e5e0] rounded-lg px-4 py-3 text-xs text-[#888780]">
              * 광고 수신 동의 고객에게만 발송됩니다. 21:00–08:00 KST 야간 발송은 차단됩니다.
            </div>

            <PrimaryButton
              onClick={handleSend}
              disabled={sending || !segment || !templateId}
            >
              {sending ? "발송 중..." : "메시지 발송"}
            </PrimaryButton>
          </div>

          {result && (
            <div className={`rounded-xl px-5 py-4 border ${result.error ? "bg-[#fff0f0] border-[#d32f2f]" : "bg-[#e1f5ee] border-[#9fe1cb]"}`}>
              {result.error ? (
                <p className="text-sm text-[#d32f2f]">오류: {result.error}</p>
              ) : (
                <>
                  <p className="font-semibold text-sm text-[#085041]">발송 완료</p>
                  <p className="text-sm text-[#085041] mt-1">성공 {result.sent ?? 0}건 / 실패 {result.failed ?? 0}건 / 건너뜀 {result.skipped ?? 0}건</p>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesPageInner />
    </Suspense>
  );
}
