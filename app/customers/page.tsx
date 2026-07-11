"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GRADE_LABEL, type Grade } from "@/lib/grade";
import AppHeader from "@/app/components/AppHeader";
import Input from "@/app/components/ui/Input";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

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

const GRADE_STYLE: Record<string, { background: string; color: string }> = {
  vip: { background: '#faeeda', color: '#633806' },
  regular: { background: '#e1f5ee', color: '#085041' },
  normal: { background: '#f8f7f4', color: '#5f5e5a' },
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

const selectCls = "bg-white border border-[#e5e5e0] rounded-lg px-2 py-2 text-sm text-[#2c2c2a] outline-none focus:border-[#0f6e56] flex-1";

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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="고객" />

      <main className="flex-1 p-8">
        <div className="w-full max-w-7xl mx-auto">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#2c2c2a' }}>고객 관리</h1>
          <button
            onClick={() => setShowAdd(true)}
            style={{ background: '#0f6e56', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
          >
            + 고객 수기 등록
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Grade filter pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { value: '', label: '전체' },
              { value: 'vip', label: 'VIP' },
              { value: 'regular', label: '단골' },
              { value: 'normal', label: '일반' },
            ].map(({ value: v, label }) => (
              <button
                key={v}
                onClick={() => setGrade(v)}
                style={{ background: grade === v ? '#0f6e56' : '#fff', color: grade === v ? '#fff' : '#5f5e5a', border: `1px solid ${grade === v ? '#0f6e56' : '#e5e5e0'}`, borderRadius: 999, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
              >
                {label}
              </button>
            ))}
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selectCls} style={{ maxWidth: 120 }}>
              <option value="">채널 전체</option>
              <option value="phone">전화</option>
              <option value="email">이메일</option>
              <option value="kakao">카카오</option>
            </select>
            <select value={lastVisitDays} onChange={(e) => setLastVisitDays(e.target.value)} className={selectCls} style={{ maxWidth: 120 }}>
              <option value="">방문일 전체</option>
              <option value="30">30일 이상</option>
              <option value="60">60일 이상</option>
              <option value="90">90일 이상</option>
            </select>
          </div>

          {/* Table card */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#f8f7f4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 2 }}>이름</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 2 }}>연락처</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 1 }}>등급</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 1 }}>방문</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a', flex: 1 }}>최근 방문</span>
            </div>
            {loading ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#888780' }}>불러오는 중...</p>
              </div>
            ) : customers.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#888780' }}>고객이 없습니다</p>
              </div>
            ) : (
              customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  style={{ background: selectedId === c.id ? '#f8f7f4' : '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', borderTop: '1px solid #e5e5e0' }}
                >
                  <span style={{ fontSize: 14, color: '#2c2c2a', flex: 2 }}>{c.name ?? "이름없음"}</span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', flex: 2 }}>{c.displayContact ?? "-"}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ ...GRADE_STYLE[c.grade], borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 500 }}>
                      {GRADE_LABEL[c.grade]}
                    </span>
                  </span>
                  <span style={{ fontSize: 14, color: '#2c2c2a', flex: 1 }}>{c.visit_count}회</span>
                  <span style={{ fontSize: 14, color: '#888780', flex: 1 }}>{relativeDate(c.last_visit_at)}</span>
                </button>
              ))
            )}
          </div>

          {/* Detail panel */}
          {selectedId && (
            <div style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:24, display:'flex', flexDirection:'column', gap:16 }}>
              {detailLoading ? (
                <p className="text-sm text-[#888780]">상세 정보 로딩 중...</p>
              ) : detail ? (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold text-[#2c2c2a]">{detail.customer.name ?? "이름없음"}</h2>
                      <p className="text-xs text-[#888780] mt-0.5">{detail.customer.displayContact ?? "-"} · {detail.customer.channel ?? "-"}</p>
                      <p className="text-xs text-[#888780]">
                        가입 {new Date(detail.customer.created_at).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <span style={{ ...GRADE_STYLE[detail.customer.grade], borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 500 }}>
                      {detail.customer.gradeLabel}
                    </span>
                  </div>

                  {/* Stamp progress */}
                  <div>
                    <p className="text-xs text-[#888780] mb-2">스탬프</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {Array.from({ length: detail.stamps.required }).map((_, i) => (
                        <div
                          key={i}
                          style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, border: `2px solid ${i < detail.stamps.current ? '#0f6e56' : '#e5e5e0'}`, color: i < detail.stamps.current ? '#0f6e56' : '#e5e5e0', background: i < detail.stamps.current ? '#e1f5ee' : '#fff' }}
                        >
                          ★
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[#888780] mt-1.5">
                      {detail.stamps.current}/{detail.stamps.required}
                      {detail.stamps.rewardDesc ? ` · ${detail.stamps.rewardDesc}` : ""}
                    </p>
                  </div>

                  {detail.visits.length > 0 && (
                    <div>
                      <p className="text-xs text-[#888780] mb-1.5">최근 방문</p>
                      <ul className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                        {detail.visits.map((v) => (
                          <li key={v.id} className="text-xs text-[#5f5e5a] flex justify-between">
                            <span>{new Date(v.visited_at).toLocaleDateString("ko-KR")}</span>
                            <span className="text-[#888780]">+{v.stamp_delta} 스탬프 · {v.source}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(detail.customer.visit_purpose || detail.customer.companion) && (
                    <p className="text-xs text-[#5f5e5a]">
                      {detail.customer.visit_purpose && <span>목적: {detail.customer.visit_purpose}</span>}
                      {detail.customer.companion && <span className="ml-2">동반: {detail.customer.companion}</span>}
                    </p>
                  )}

                  {detail.consents.length > 0 && (
                    <div>
                      <p className="text-xs text-[#888780] mb-1.5">동의 항목</p>
                      <div className="flex flex-wrap gap-1">
                        {detail.consents.map((con) => (
                          <span key={con.type} style={{ background: '#e1f5ee', color: '#085041', padding: '2px 8px', borderRadius: 999, fontSize: 12 }}>
                            {con.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.messages.length > 0 && (
                    <div>
                      <p className="text-xs text-[#888780] mb-1.5">메시지 이력</p>
                      <ul className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                        {detail.messages.map((m) => (
                          <li key={m.id} className="text-xs text-[#5f5e5a] flex justify-between">
                            <span>{m.channel} · {m.template_id ?? "직접"}</span>
                            <span className={m.status === "sent" ? "text-[#085041]" : "text-[#888780]"}>
                              {m.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-[#888780] mb-1.5">메모</p>
                    <textarea
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      rows={3}
                      placeholder="점주 메모 (고객에게 보이지 않음)"
                      className="w-full text-sm bg-white border border-[#e5e5e0] rounded-lg px-3 py-2 resize-none outline-none focus:border-[#0f6e56]"
                    />
                    <div className="flex justify-end mt-1">
                      <button
                        onClick={saveMemo}
                        disabled={memoSaving}
                        style={{ fontSize: 12, background: '#0f6e56', color: '#fff', padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', opacity: memoSaving ? 0.5 : 1 }}
                      >
                        {memoSaving ? "저장 중..." : "메모 저장"}
                      </button>
                    </div>
                  </div>

                  <Link
                    href={`/messages?customerId=${selectedId}`}
                    style={{ display: 'block', textAlign: 'center', fontSize: 14, color: '#0f6e56', border: '1px solid #9fe1cb', borderRadius: 12, padding: '10px 0', textDecoration: 'none' }}
                  >
                    이 고객에게 소식 보내기
                  </Link>
                </>
              ) : (
                <p className="text-sm text-[#d32f2f]">상세 정보를 불러올 수 없습니다</p>
              )}
            </div>
          )}
        </div>
        </div>
      </main>

      {showAdd && <ManualAddModal onClose={() => setShowAdd(false)} onSuccess={fetchList} />}
    </div>
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
        className="bg-white rounded-t-3xl w-full max-w-xl p-6 pb-10 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[#2c2c2a]">고객 직접 등록</h2>

        <div className="flex gap-2">
          {(["phone", "email", "kakao"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 cursor-pointer transition-colors ${
                channel === ch ? "bg-[#0f6e56] text-white border-[#0f6e56]" : "text-[#5f5e5a] border-[#e5e5e0]"
              }`}
            >
              {ch === "phone" ? "전화" : ch === "email" ? "이메일" : "카카오"}
            </button>
          ))}
        </div>

        <Input
          type={channel === "email" ? "email" : "text"}
          placeholder={channel === "phone" ? "010-0000-0000" : channel === "email" ? "example@mail.com" : "카카오 ID"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <Input
          type="text"
          placeholder="고객 이름 (선택)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm text-[#2c2c2a] cursor-pointer">
          <input type="checkbox" checked={adConsent} onChange={(e) => setAdConsent(e.target.checked)} className="accent-[#0f6e56]" />
          광고성 정보 수신 동의
        </label>

        {error && <p className="text-xs text-[#d32f2f]">{error}</p>}

        <PrimaryButton onClick={submit} disabled={submitting}>
          {submitting ? "등록 중..." : "등록하기"}
        </PrimaryButton>
      </div>
    </div>
  );
}
