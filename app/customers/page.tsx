"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GRADE_LABEL, type Grade } from "@/lib/grade";

interface CustomerListItem {
  id: string;
  name: string | null;
  displayContact: string | null;
  channel: string | null;
  grade: Grade;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
}

interface CustomerDetail {
  customer: {
    id: string;
    name: string | null;
    displayContact: string | null;
    channel: string | null;
    grade: Grade;
    gradeLabel: string;
    visit_count: number;
    last_visit_at: string | null;
    visit_purpose: string | null;
    companion: string | null;
    memo: string | null;
    created_at: string;
  };
  stamps: { current: number; required: number; rewardDesc: string | null };
  visits: { id: string; visited_at: string; stamp_delta: number; source: string }[];
  messages: { id: string; channel: string; template_id: string | null; status: string; created_at: string }[];
  consents: { type: string; agreed: boolean; agreed_at: string }[];
}

const GRADE_COLORS: Record<string, string> = {
  vip: "bg-amber-100 text-amber-700",
  regular: "bg-teal-100 text-teal-700",
  normal: "bg-gray-100 text-gray-600",
};

function relativeDate(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState("");
  const [channel, setChannel] = useState("");
  const [lastVisitDays, setLastVisitDays] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (grade) params.set("grade", grade);
    if (channel) params.set("channel", channel);
    if (lastVisitDays) params.set("lastVisitDays", lastVisitDays);
    const res = await fetch(`/api/customers/list?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers ?? []);
    }
    setLoading(false);
  }, [grade, channel, lastVisitDays]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    const res = await fetch(`/api/customers/${id}`);
    if (res.ok) {
      const data: CustomerDetail = await res.json();
      setDetail(data);
      setMemo(data.customer.memo ?? "");
    }
    setDetailLoading(false);
  };

  const saveMemo = async () => {
    if (!selectedId) return;
    setMemoSaving(true);
    await fetch(`/api/customers/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo }),
    });
    setMemoSaving(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 text-sm">← 홈</Link>
          <h1 className="text-lg font-bold text-gray-900">고객 관리</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-teal-600 text-white text-sm px-3 py-1.5 rounded-lg"
        >
          + 직접 등록
        </button>
      </header>

      <div className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">등급 전체</option>
            <option value="vip">VIP</option>
            <option value="regular">단골</option>
            <option value="normal">일반</option>
          </select>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">채널 전체</option>
            <option value="phone">전화</option>
            <option value="email">이메일</option>
            <option value="kakao">카카오</option>
          </select>
          <select
            value={lastVisitDays}
            onChange={(e) => setLastVisitDays(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">방문일 전체</option>
            <option value="30">30일 이상</option>
            <option value="60">60일 이상</option>
            <option value="90">90일 이상</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-8">불러오는 중...</p>
        ) : customers.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">고객이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => openDetail(c.id)}
                className={`w-full bg-white rounded-2xl px-4 py-3.5 shadow-sm text-left flex items-center justify-between ${
                  selectedId === c.id ? "ring-2 ring-teal-400" : ""
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{c.name ?? "이름없음"}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${GRADE_COLORS[c.grade]}`}>
                      {GRADE_LABEL[c.grade]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.displayContact ?? "-"} · 방문 {c.visit_count}회
                  </p>
                </div>
                <p className="text-xs text-gray-400 shrink-0 ml-2">{relativeDate(c.last_visit_at)}</p>
              </button>
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selectedId && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            {detailLoading ? (
              <p className="text-sm text-gray-400">상세 정보 로딩 중...</p>
            ) : detail ? (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-800">{detail.customer.name ?? "이름없음"}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{detail.customer.displayContact ?? "-"} · {detail.customer.channel ?? "-"}</p>
                    <p className="text-xs text-gray-400">
                      가입 {new Date(detail.customer.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <span className={`text-sm px-2 py-1 rounded-full ${GRADE_COLORS[detail.customer.grade]}`}>
                    {detail.customer.gradeLabel}
                  </span>
                </div>

                {/* Stamp progress */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">스탬프</p>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: detail.stamps.required }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          i < detail.stamps.current ? "bg-teal-500 text-white" : "bg-gray-100 text-gray-300"
                        }`}
                      >
                        ★
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {detail.stamps.current}/{detail.stamps.required}
                    {detail.stamps.rewardDesc ? ` · ${detail.stamps.rewardDesc}` : ""}
                  </p>
                </div>

                {/* Visit timeline */}
                {detail.visits.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">최근 방문</p>
                    <ul className="space-y-1 max-h-36 overflow-y-auto">
                      {detail.visits.map((v) => (
                        <li key={v.id} className="text-xs text-gray-600 flex justify-between">
                          <span>{new Date(v.visited_at).toLocaleDateString("ko-KR")}</span>
                          <span className="text-gray-400">+{v.stamp_delta} 스탬프 · {v.source}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Purpose / companion */}
                {(detail.customer.visit_purpose || detail.customer.companion) && (
                  <p className="text-xs text-gray-500">
                    {detail.customer.visit_purpose && <span>목적: {detail.customer.visit_purpose}</span>}
                    {detail.customer.companion && <span className="ml-2">동반: {detail.customer.companion}</span>}
                  </p>
                )}

                {/* Consents */}
                {detail.consents.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">동의 항목</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.consents.map((con) => (
                        <span key={con.type} className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                          {con.type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message history */}
                {detail.messages.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">메시지 이력</p>
                    <ul className="space-y-1 max-h-28 overflow-y-auto">
                      {detail.messages.map((m) => (
                        <li key={m.id} className="text-xs text-gray-600 flex justify-between">
                          <span>{m.channel} · {m.template_id ?? "직접"}</span>
                          <span className={`${m.status === "sent" ? "text-teal-500" : "text-gray-400"}`}>
                            {m.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Memo */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">메모</p>
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={3}
                    placeholder="점주 메모 (고객에게 보이지 않음)"
                    className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-teal-400"
                  />
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={saveMemo}
                      disabled={memoSaving}
                      className="text-xs bg-teal-600 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                    >
                      {memoSaving ? "저장 중..." : "메모 저장"}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <Link
                    href={`/messages?customerId=${selectedId}`}
                    className="block text-center text-sm text-teal-600 border border-teal-200 rounded-xl py-2"
                  >
                    이 고객에게 소식 보내기
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-red-400">상세 정보를 불러올 수 없습니다</p>
            )}
          </div>
        )}
      </div>

      {/* Manual add modal */}
      {showAdd && <ManualAddModal onClose={() => setShowAdd(false)} onSuccess={fetchList} />}
    </main>
  );
}

function ManualAddModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [channel, setChannel] = useState<"phone" | "email" | "kakao">("phone");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [adConsent, setAdConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError("");
    if (!identifier.trim()) { setError("연락처를 입력하세요"); return; }
    setSubmitting(true);
    const res = await fetch("/api/customers/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        identifier: identifier.trim(),
        name: name.trim() || undefined,
        consents: {
          required: true,
          ad_sms: channel === "phone" && adConsent,
          ad_kakao: channel === "kakao" && adConsent,
          ad_email: channel === "email" && adConsent,
        },
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? "등록 실패"); return; }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-xl p-6 pb-10 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800">고객 직접 등록</h2>

        <div className="flex gap-2">
          {(["phone", "email", "kakao"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                channel === ch ? "bg-teal-600 text-white border-teal-600" : "text-gray-500 border-gray-200"
              }`}
            >
              {ch === "phone" ? "전화" : ch === "email" ? "이메일" : "카카오"}
            </button>
          ))}
        </div>

        <input
          type={channel === "email" ? "email" : "text"}
          placeholder={channel === "phone" ? "010-0000-0000" : channel === "email" ? "example@mail.com" : "카카오 ID"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
        />

        <input
          type="text"
          placeholder="고객 이름 (선택)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={adConsent} onChange={(e) => setAdConsent(e.target.checked)} />
          광고성 정보 수신 동의
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "등록하기"}
        </button>
      </div>
    </div>
  );
}
