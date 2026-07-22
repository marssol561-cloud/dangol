"use client";
import { useState, useEffect, useCallback, type CSSProperties } from "react";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import Input from "@/app/components/ui/Input";

type EventType = "onsite" | "preannounce";
type EventStatus = "scheduled" | "active" | "closed" | "ended";
type SegmentType = "grade" | "churn" | "anniversary";
type TemplateId = "coupon_issued" | "stamp_reward" | "returning_reminder" | "churn_reengage" | "anniversary";

interface EventListItem {
  id: string;
  store_link_id: string;
  type: EventType;
  title: string;
  description: string | null;
  condition: string | null;
  reward_coupon_kind: string | null;
  reward_benefit: string | null;
  start_at: string | null;
  end_at: string | null;
  issue_cap: number | null;
  coupon_valid_days: number | null;
  status: EventStatus;
  derivedStatus: EventStatus;
  approvedCount: number;
  created_at: string;
}

interface Participant {
  id: string;
  customer_id: string;
  status: "pending" | "approved" | "expired" | "cancelled";
  condition_answer: string | null;
  approved_at: string | null;
  tag: string | null;
  coupon_id: string | null;
}

interface EventDetailResponse {
  event: EventListItem;
  participants: Participant[];
  counters: { participated: number; issued: number; exchanged: number; thirdPartyConsentRate: number };
}

const TABS: { key: EventStatus; label: string }[] = [
  { key: "scheduled", label: "예정" },
  { key: "active", label: "진행" },
  { key: "closed", label: "마감" },
  { key: "ended", label: "종료" },
];

const TYPE_LABEL: Record<EventType, string> = { onsite: "현장", preannounce: "예고" };
const STATUS_LABEL: Record<EventStatus, string> = { scheduled: "예정", active: "진행", closed: "마감", ended: "종료" };

const TAG_OPTIONS = ["생일", "결혼기념일", "군인 동반", "어르신 동반", "커플", "가족"];

const SEGMENT_OPTIONS: { label: string; segment: SegmentType; grade?: string }[] = [
  { label: "VIP", segment: "grade", grade: "vip" },
  { label: "단골", segment: "grade", grade: "regular" },
  { label: "일반", segment: "grade", grade: "normal" },
  { label: "장기미방문", segment: "churn" },
  { label: "기념일", segment: "anniversary" },
];

const TEMPLATE_OPTIONS: { value: TemplateId; label: string }[] = [
  { value: "coupon_issued", label: "쿠폰 발급 안내" },
  { value: "stamp_reward", label: "스탬프 리워드" },
  { value: "returning_reminder", label: "재방문 안내" },
  { value: "churn_reengage", label: "이탈 고객 재유입" },
  { value: "anniversary", label: "기념일 메시지" },
];

const ERROR_LABEL: Record<string, string> = {
  title_required: "제목을 입력하세요",
  period_inverted: "종료일이 시작일보다 빠릅니다",
  cap_zero: "발급 한도는 1 이상이어야 합니다",
  reward_missing: "리워드(쿠폰 종류 또는 혜택)를 입력하세요",
  night_blocked: "21:00-08:00 KST 발송 불가",
  not_preannounce: "예고형 이벤트만 발송할 수 있습니다",
};

const card: CSSProperties = { background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 24 };
const selectCls = "bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] outline-none focus:border-[#0f6e56] transition-colors w-full";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ko-KR") : "";
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EventStatus>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EventListItem | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/events");
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state set after await, not a sync render hazard
    fetchList();
  }, [fetchList]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    const res = await fetch(`/api/events/${id}`);
    if (res.ok) setDetail(await res.json());
    setDetailLoading(false);
  }, []);

  const refreshAll = useCallback(async () => {
    await fetchList();
    if (selectedId) await openDetail(selectedId);
  }, [fetchList, openDetail, selectedId]);

  const filtered = events.filter((e) => e.derivedStatus === tab);

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="이벤트" />

      <main className="flex-1 p-8">
        <div className="w-full max-w-7xl mx-auto" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#2c2c2a" }}>이벤트 관리</h1>
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              style={{ background: "#0f6e56", color: "#fff", fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}
            >
              + 이벤트 만들기
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  background: tab === t.key ? "#0f6e56" : "#fff",
                  color: tab === t.key ? "#fff" : "#5f5e5a",
                  border: `1px solid ${tab === t.key ? "#0f6e56" : "#e5e5e0"}`,
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#888780" }}>불러오는 중...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#888780" }}>
                  {events.length === 0 ? "첫 이벤트를 만들어보세요" : "해당 상태의 이벤트가 없습니다"}
                </p>
                {events.length === 0 && (
                  <button
                    onClick={() => {
                      setEditing(null);
                      setShowForm(true);
                    }}
                    style={{ marginTop: 12, background: "#0f6e56", color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer" }}
                  >
                    첫 이벤트 만들기
                  </button>
                )}
              </div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => openDetail(e.id)}
                  style={{ background: selectedId === e.id ? "#f8f7f4" : "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, width: "100%", textAlign: "left", cursor: "pointer", border: "none", borderTop: "1px solid #e5e5e0" }}
                >
                  <span
                    style={{
                      background: e.type === "onsite" ? "#e1f5ee" : "#faeeda",
                      color: e.type === "onsite" ? "#085041" : "#633806",
                      borderRadius: 999,
                      padding: "3px 8px",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {TYPE_LABEL[e.type]}
                  </span>
                  <span style={{ fontSize: 14, color: "#2c2c2a", flex: 2 }}>{e.title}</span>
                  <span style={{ fontSize: 12, color: "#888780", flex: 2 }}>
                    {e.start_at ? fmtDate(e.start_at) : "상시"} ~ {e.end_at ? fmtDate(e.end_at) : "무기한"}
                  </span>
                  <span style={{ fontSize: 12, color: "#5f5e5a", flex: 1 }}>{STATUS_LABEL[e.derivedStatus]}</span>
                  <span style={{ fontSize: 12, color: "#888780", flex: 1 }}>참여 {e.approvedCount}건</span>
                </button>
              ))
            )}
          </div>

          {selectedId && (
            <EventDetailPanel
              detailLoading={detailLoading}
              detail={detail}
              onEdit={(e) => {
                setEditing(e);
                setShowForm(true);
              }}
              onRefresh={refreshAll}
            />
          )}
        </div>
      </main>

      {showForm && (
        <EventFormModal
          editing={editing}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function EventDetailPanel({
  detailLoading,
  detail,
  onEdit,
  onRefresh,
}: {
  detailLoading: boolean;
  detail: EventDetailResponse | null;
  onEdit: (e: EventListItem) => void;
  onRefresh: () => void;
}) {
  if (detailLoading) {
    return (
      <div style={card}>
        <p className="text-sm text-[#888780]">상세 정보 로딩 중...</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div style={card}>
        <p className="text-sm text-[#d32f2f]">상세 정보를 불러올 수 없습니다</p>
      </div>
    );
  }

  const { event, participants, counters } = detail;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: event.type === "onsite" ? "#e1f5ee" : "#faeeda",
                  color: event.type === "onsite" ? "#085041" : "#633806",
                  borderRadius: 999,
                  padding: "3px 8px",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {TYPE_LABEL[event.type]}
              </span>
              <h2 className="font-semibold text-[#2c2c2a]">{event.title}</h2>
              {event.derivedStatus === "closed" && (
                <span style={{ background: "#f8f7f4", color: "#888780", borderRadius: 999, padding: "3px 8px", fontSize: 11 }}>마감</span>
              )}
            </div>
            {event.description && <p className="text-xs text-[#888780] mt-1">{event.description}</p>}
            {event.condition && <p className="text-xs text-[#5f5e5a] mt-1">조건: {event.condition}</p>}
          </div>
          <button
            onClick={() => onEdit(event)}
            style={{ fontSize: 12, color: "#0f6e56", background: "#fff", border: "1px solid #9fe1cb", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
          >
            수정
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20 }}>
          {[
            { label: "참여", value: counters.participated },
            { label: "발급", value: counters.issued },
            { label: "교환", value: counters.exchanged },
            { label: "제3자 동의율", value: `${Math.round(counters.thirdPartyConsentRate * 100)}%` },
          ].map((c) => (
            <div key={c.label} style={{ background: "#f8f7f4", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "#0f6e56" }}>{c.value}</p>
              <p style={{ fontSize: 12, color: "#888780", marginTop: 4 }}>{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ background: "#f8f7f4", padding: "14px 20px", display: "flex", gap: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5f5e5a", flex: 2 }}>고객</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5f5e5a", flex: 1 }}>상태</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5f5e5a", flex: 1 }}>태그</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5f5e5a", flex: 1 }}>승인일</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5f5e5a", flex: 1 }}>쿠폰</span>
        </div>
        {participants.length === 0 ? (
          <div style={{ padding: "24px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#888780" }}>아직 참여자가 없습니다</p>
          </div>
        ) : (
          participants.map((p) => (
            <Link
              key={p.id}
              href={`/customers?id=${p.customer_id}`}
              style={{ padding: "12px 20px", display: "flex", gap: 16, borderTop: "1px solid #e5e5e0", textDecoration: "none" }}
            >
              <span style={{ fontSize: 13, color: "#0f6e56", flex: 2 }}>{p.customer_id.slice(0, 8)}...</span>
              <span style={{ fontSize: 13, color: "#5f5e5a", flex: 1 }}>{p.status}</span>
              <span style={{ fontSize: 13, color: "#5f5e5a", flex: 1 }}>{p.tag ?? "-"}</span>
              <span style={{ fontSize: 12, color: "#888780", flex: 1 }}>{p.approved_at ? fmtDate(p.approved_at) : "-"}</span>
              <span style={{ fontSize: 12, color: "#888780", flex: 1 }}>{p.coupon_id ? "발급" : "-"}</span>
            </Link>
          ))
        )}
      </div>

      {event.type === "preannounce" && <PreannouncePanel event={event} onSent={onRefresh} />}
    </div>
  );
}

function PreannouncePanel({ event, onSent }: { event: EventListItem; onSent: () => void }) {
  const [segmentIdx, setSegmentIdx] = useState(0);
  const [templateId, setTemplateId] = useState<TemplateId | "">("");
  const [preview, setPreview] = useState<{ count: number; estimatedCost: number; costIsEstimate: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

  const opt = SEGMENT_OPTIONS[segmentIdx];

  async function callAnnounce(preview: boolean) {
    return fetch(`/api/events/${event.id}/announce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_link_id: event.store_link_id,
        segment: opt.segment,
        template_id: templateId,
        template_vars: opt.grade ? { grade: opt.grade } : {},
        preview,
      }),
    });
  }

  const runPreview = async () => {
    if (!templateId) {
      setError("템플릿을 선택하세요");
      return;
    }
    setError("");
    setPreviewing(true);
    setPreview(null);
    setSendResult(null);
    const res = await callAnnounce(true);
    const data = await res.json();
    setPreviewing(false);
    if (!res.ok) {
      setError(ERROR_LABEL[data.error] ?? data.error ?? "미리보기 실패");
      return;
    }
    setPreview(data);
  };

  const send = async () => {
    if (!templateId) return;
    setError("");
    setSending(true);
    const res = await callAnnounce(false);
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(ERROR_LABEL[data.error] ?? data.error ?? "발송 실패");
      return;
    }
    setSendResult(data);
    onSent();
  };

  return (
    <div style={card}>
      <h3 className="font-semibold text-[#2c2c2a] text-sm mb-3">예고 발송</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5f5e5a]">발송 대상</label>
          <select
            value={segmentIdx}
            onChange={(e) => {
              setSegmentIdx(Number(e.target.value));
              setPreview(null);
            }}
            className={selectCls}
          >
            {SEGMENT_OPTIONS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5f5e5a]">메시지 템플릿</label>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value as TemplateId);
              setPreview(null);
            }}
            className={selectCls}
          >
            <option value="">-- 선택 --</option>
            {TEMPLATE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-[#d32f2f]">{error}</p>}

        {preview && (
          <div className="bg-[#f8f7f4] border border-[#e5e5e0] rounded-lg px-4 py-3 text-sm text-[#2c2c2a]">
            예상 {preview.count}건 · 예상 비용 {preview.estimatedCost.toLocaleString()}원
            {preview.costIsEstimate && <span className="text-[#888780] text-xs"> (설정 확인 전 추정치)</span>}
          </div>
        )}

        {sendResult && (
          <div className="bg-[#e1f5ee] border border-[#9fe1cb] rounded-lg px-4 py-3 text-sm text-[#085041]">
            발송 완료 — 성공 {sendResult.sent}건 / 실패 {sendResult.failed}건 / 건너뜀 {sendResult.skipped}건
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={runPreview}
            disabled={previewing || !templateId}
            style={{ flex: 1, background: "#fff", color: "#0f6e56", border: "1px solid #9fe1cb", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {previewing ? "확인 중..." : "예상 건수·비용 보기"}
          </button>
          <PrimaryButton onClick={send} disabled={sending || !preview} style={{ flex: 1 }}>
            {sending ? "발송 중..." : "발송"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function EventFormModal({
  editing,
  onClose,
  onSuccess,
}: {
  editing: EventListItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<EventType>(editing?.type ?? "onsite");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [tags, setTags] = useState<string[]>(() => (editing?.condition ? TAG_OPTIONS.filter((t) => editing.condition!.includes(t)) : []));
  const [conditionNote, setConditionNote] = useState(() => {
    if (!editing?.condition) return "";
    let rest = editing.condition;
    for (const t of TAG_OPTIONS) rest = rest.replace(t, "");
    return rest.replace(/^[,\s]+|[,\s]+$/g, "");
  });
  const [rewardKind, setRewardKind] = useState(editing?.reward_coupon_kind ?? "");
  const [rewardBenefit, setRewardBenefit] = useState(editing?.reward_benefit ?? "");
  const [startAt, setStartAt] = useState(editing?.start_at ? editing.start_at.slice(0, 16) : "");
  const [endAt, setEndAt] = useState(editing?.end_at ? editing.end_at.slice(0, 16) : "");
  const [issueCap, setIssueCap] = useState(editing?.issue_cap != null ? String(editing.issue_cap) : "");
  const [couponValidDays, setCouponValidDays] = useState(editing?.coupon_valid_days != null ? String(editing.coupon_valid_days) : "14");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = async () => {
    setError("");
    if (!title.trim()) {
      setError(ERROR_LABEL.title_required);
      return;
    }
    setSubmitting(true);

    const condition = [...tags, conditionNote.trim()].filter(Boolean).join(", ") || null;

    const body = {
      type,
      title: title.trim(),
      description: description.trim() || null,
      condition,
      reward_coupon_kind: rewardKind.trim() || null,
      reward_benefit: rewardBenefit.trim() || null,
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at: endAt ? new Date(endAt).toISOString() : null,
      issue_cap: issueCap ? parseInt(issueCap, 10) : null,
      coupon_valid_days: couponValidDays ? parseInt(couponValidDays, 10) : 14,
    };

    const res = await fetch(editing ? `/api/events/${editing.id}` : "/api/events", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(ERROR_LABEL[data.error] ?? data.error ?? "저장 실패");
      return;
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-xl p-6 pb-10 flex flex-col gap-4 overflow-y-auto"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[#2c2c2a]">{editing ? "이벤트 수정" : "이벤트 만들기"}</h2>

        <div className="flex gap-2">
          {(["onsite", "preannounce"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 cursor-pointer transition-colors ${
                type === t ? "bg-[#0f6e56] text-white border-[#0f6e56]" : "text-[#5f5e5a] border-[#e5e5e0]"
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <Input placeholder="이벤트 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full text-sm bg-white border border-[#e5e5e0] rounded-lg px-3 py-2 resize-none outline-none focus:border-[#0f6e56]"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5f5e5a]">참여 조건 (스태프 육안 확인용, 자동 판정 아님)</label>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                style={{
                  background: tags.includes(t) ? "#0f6e56" : "#fff",
                  color: tags.includes(t) ? "#fff" : "#5f5e5a",
                  border: `1px solid ${tags.includes(t) ? "#0f6e56" : "#e5e5e0"}`,
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <Input placeholder="자유 입력 (선택)" value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <Input placeholder="쿠폰 종류 (예: A)" value={rewardKind} onChange={(e) => setRewardKind(e.target.value)} />
          <Input placeholder="혜택 (예: 아메리카노 1잔)" value={rewardBenefit} onChange={(e) => setRewardBenefit(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5f5e5a]">기간 (선택)</label>
          <div className="flex gap-2">
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={selectCls} />
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={selectCls} />
          </div>
        </div>

        <div className="flex gap-2">
          <Input placeholder="발급 한도 (선택)" type="number" value={issueCap} onChange={(e) => setIssueCap(e.target.value)} />
          <Input placeholder="쿠폰 유효일수" type="number" value={couponValidDays} onChange={(e) => setCouponValidDays(e.target.value)} />
        </div>

        {error && <p className="text-xs text-[#d32f2f]">{error}</p>}

        <PrimaryButton onClick={submit} disabled={submitting}>
          {submitting ? "저장 중..." : editing ? "수정하기" : "만들기"}
        </PrimaryButton>
      </div>
    </div>
  );
}
