"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Input from "@/app/components/ui/Input";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

type Step = "loading" | "b1" | "b2" | "b3" | "done" | "error";
type Channel = "phone" | "kakao" | "email";
type VisitPurpose = "혼밥" | "친구" | "연인" | "가족" | "기념일";

type ActiveEvent = { id: string; type: "onsite" | "preannounce"; title: string; description: string | null; reward_benefit: string | null };
type EventJoinStep = "b1" | "b2" | "b3";
type EventConsents = { required: boolean; thirdparty: boolean; ad_sms: boolean; ad_kakao: boolean; ad_email: boolean };
type Participation = { status: string; coupon?: { code: string; benefit: string | null } };
type UpcomingPreannounce = { id: string; title: string; start_at: string | null };

const VISIT_PURPOSES: VisitPurpose[] = ["혼밥", "친구", "연인", "가족", "기념일"];

const CHANNEL_LABELS: Record<Channel, string> = {
  phone: "문자(SMS)",
  kakao: "카카오",
  email: "이메일",
};

const CHANNEL_PLACEHOLDERS: Record<Channel, string> = {
  phone: "010-0000-0000",
  kakao: "카카오 아이디",
  email: "example@email.com",
};

type MyCoupon = { code: string; kind: string; benefit: string; expires_at: string };

interface StampsPolicy { required_count: number }
interface CheckInResult {
  accrued: boolean;
  reason?: string;
  visit_count?: number;
  grade?: string;
  coupon?: { id: string; code: string; benefit: string; expires_at: string };
}


export default function CustomerPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const storeCode = params?.code ?? "";
  const refToken = searchParams?.get("ref") ?? undefined;

  const [step, setStep] = useState<Step>("loading");
  const [storeName, setStoreName] = useState<string>("");

  // B1 state
  const [visitPurpose, setVisitPurpose] = useState<VisitPurpose | "">("");

  // B2 state
  const [channel, setChannel] = useState<Channel>("phone");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [consents, setConsents] = useState({
    required: false,
    thirdparty: false,
    ad_sms: false,
    ad_kakao: false,
    ad_email: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // B3 state
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [stampsPolicy, setStampsPolicy] = useState<StampsPolicy>({ required_count: 10 });
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([]);

  // ── Event gate state (SP-E3) — overlay in front of the 평시 flow, does not alter it ──
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [eventClosedNotice, setEventClosedNotice] = useState(false);
  const [eventGateDismissed, setEventGateDismissed] = useState(false);
  const [eventJoinStep, setEventJoinStep] = useState<EventJoinStep>("b1");
  const [eventChannel, setEventChannel] = useState<Channel>("phone");
  const [eventIdentifier, setEventIdentifier] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventConsents, setEventConsents] = useState<EventConsents>({
    required: false,
    thirdparty: false,
    ad_sms: false,
    ad_kakao: false,
    ad_email: false,
  });
  const [existingConsents, setExistingConsents] = useState({ required: false, thirdparty: false });
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [eventError, setEventError] = useState("");
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [upcomingPreannounce, setUpcomingPreannounce] = useState<UpcomingPreannounce[]>([]);

  useEffect(() => {
    if (!storeCode) return;

    fetch(`/api/r/${storeCode}/store`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d.store_name === undefined) {
          setStep("error");
          setErrorMsg("유효하지 않은 QR 코드입니다.");
          return;
        }
        setStoreName(d.store_name);

        if (d.event) {
          setActiveEvent(d.event as ActiveEvent);
        } else if (d.eventClosed) {
          setEventClosedNotice(true);
        }

        const ciRes = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_code: storeCode }),
        });
        const ci: CheckInResult = await ciRes.json();

        if (ci.accrued || ci.reason === "too_soon") {
          setCheckInResult(ci);

          const [policyRes, couponsRes] = await Promise.all([
            fetch(`/api/stamps-rewards`).catch(() => null),
            fetch(`/api/coupons/mine?store_code=${storeCode}`).catch(() => null),
          ]);
          if (policyRes?.ok) {
            const p = await policyRes.json();
            if (p.required_count) setStampsPolicy({ required_count: p.required_count });
          }
          if (couponsRes?.ok) {
            const c = await couponsRes.json();
            setMyCoupons(c.coupons ?? []);
          }

          setStep("b3");
        } else {
          setStep("b1");
        }
      })
      .catch(() => {
        setStep("error");
        setErrorMsg("매장 정보를 불러오지 못했습니다.");
      });
  }, [storeCode]);

  function handleB1Next() {
    if (!visitPurpose) return;
    setStep("b2");
  }

  // ── Event flow handlers (SP-E3) ────────────────────────────
  async function handleEventJoinStart() {
    setEventError("");
    try {
      const res = await fetch(`/api/r/${storeCode}/event-status`);
      if (res.ok) {
        const data = await res.json();
        setUpcomingPreannounce(data.upcomingPreannounce ?? []);
        if (data.participation) {
          setParticipation(data.participation);
          setEventJoinStep("b3");
          return;
        }
        setExistingConsents(data.existingConsents ?? { required: false, thirdparty: false });
      }
    } catch {
      // non-fatal — proceed to b2 with default (unconsented) state
    }
    setEventJoinStep("b2");
  }

  async function handleEventJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventIdentifier.trim()) {
      setEventError("연락처를 입력해 주세요.");
      return;
    }
    setEventSubmitting(true);
    setEventError("");
    try {
      const res = await fetch(`/api/r/${storeCode}/event-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: eventChannel,
          identifier: eventIdentifier.trim(),
          name: eventName.trim() || undefined,
          consents: {
            required: existingConsents.required || eventConsents.required,
            thirdparty: existingConsents.thirdparty || eventConsents.thirdparty,
            ad_sms: eventConsents.ad_sms,
            ad_kakao: eventConsents.ad_kakao,
            ad_email: eventConsents.ad_email,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "no_active_event") {
          setEventGateDismissed(true);
          return;
        }
        setEventError(
          data.error === "consent_required"
            ? "개인정보 수집·이용 동의(필수)를 체크해 주세요."
            : data.error === "thirdparty_required"
            ? "제3자 제공 동의(필수)를 체크해 주세요."
            : data.error ?? "제출에 실패했습니다."
        );
        return;
      }
      setParticipation({ status: data.status });
      setEventJoinStep("b3");
    } catch {
      setEventError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setEventSubmitting(false);
    }
  }

  useEffect(() => {
    if (eventJoinStep !== "b3" || !activeEvent || participation?.status === "approved") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/r/${storeCode}/event-status`);
        if (res.ok) {
          const data = await res.json();
          setUpcomingPreannounce(data.upcomingPreannounce ?? []);
          if (data.participation) setParticipation(data.participation);
        }
      } catch {
        // ignore transient poll errors — next tick retries
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [eventJoinStep, activeEvent, storeCode, participation?.status]);

  const showEventGate = !!activeEvent && !eventGateDismissed;

  async function handleB2Submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consents.required) {
      alert("개인정보 수집·이용 동의(필수)를 체크해 주세요.");
      return;
    }
    if (!identifier.trim()) {
      alert("연락처를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_code: storeCode,
          channel,
          identifier: identifier.trim(),
          name: name.trim() || undefined,
          visit_purpose: visitPurpose,
          consents,
          ...(refToken ? { ref: refToken } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "제출에 실패했습니다.");
        return;
      }

      setCouponCode(data.coupon_code);
      setStep("done");
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "loading") {
    return (
      <main className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-5">
        <p className="text-sm text-[#888780]">불러오는 중...</p>
      </main>
    );
  }

  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-5">
        <p className="text-sm text-[#d32f2f]">{errorMsg || "오류가 발생했습니다."}</p>
      </main>
    );
  }

  // ── Event B1: intro card + 참여 CTA (SP-E3) ─────────────────
  if (showEventGate && eventJoinStep === "b1") {
    return (
      <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
          <p style={{ fontSize: 12, color: '#e1f5ee' }}>오늘의 이벤트</p>
        </header>

        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#faeeda', border: '1px solid #f0d9a8', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ alignSelf: 'flex-start', background: '#0f6e56', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
              {activeEvent!.type === "onsite" ? "현장 이벤트" : "예고 이벤트"}
            </span>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#633806' }}>{activeEvent!.title}</h2>
            {activeEvent!.description && <p style={{ fontSize: 14, color: '#5f5e5a' }}>{activeEvent!.description}</p>}
            {activeEvent!.reward_benefit && (
              <p style={{ fontSize: 14, fontWeight: 600, color: '#633806' }}>혜택: {activeEvent!.reward_benefit}</p>
            )}
          </div>

          <PrimaryButton onClick={handleEventJoinStart}>이벤트 참여하기</PrimaryButton>

          <button
            onClick={() => setEventGateDismissed(true)}
            style={{ background: 'transparent', border: 'none', color: '#888780', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 8 }}
          >
            이벤트 없이 스탬프만 받을게요
          </button>
        </div>
      </main>
    );
  }

  // ── Event B2: identity + both-mandatory consents (SP-E3) ────
  if (showEventGate && eventJoinStep === "b2") {
    const needsRequired = !existingConsents.required;
    const needsThirdparty = !existingConsents.thirdparty;
    const needsAnyConsent = needsRequired || needsThirdparty;

    return (
      <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
          <p style={{ fontSize: 12, color: '#e1f5ee' }}>{activeEvent!.title}</p>
        </header>

        <div style={{ flex: 1, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#2c2c2a', marginBottom: 16 }}>참여 정보를 입력해 주세요</h2>
          <form onSubmit={handleEventJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {(["phone", "kakao", "email"] as Channel[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setEventChannel(ch)}
                  style={{ flex: 1, background: eventChannel === ch ? '#0f6e56' : '#fff', color: eventChannel === ch ? '#fff' : '#5f5e5a', border: `1px solid ${eventChannel === ch ? '#0f6e56' : '#e5e5e0'}`, borderRadius: 999, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>

            <Input
              type={eventChannel === "email" ? "email" : "text"}
              placeholder={CHANNEL_PLACEHOLDERS[eventChannel]}
              value={eventIdentifier}
              onChange={(e) => setEventIdentifier(e.target.value)}
              required
            />

            <Input
              type="text"
              placeholder="이름 (선택)"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />

            {needsAnyConsent ? (
              <div style={{ background: '#f8f7f4', border: '1px solid #e5e5e0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a' }}>동의 항목 (이벤트 참여 시 개인정보·제3자 제공 모두 필수)</p>
                {needsRequired && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c2c2a', cursor: 'pointer' }}>
                    <input type="checkbox" checked={eventConsents.required} onChange={(e) => setEventConsents({ ...eventConsents, required: e.target.checked })} className="accent-[#0f6e56]" />
                    [필수] 개인정보 수집·이용 동의
                  </label>
                )}
                {needsThirdparty && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c2c2a', cursor: 'pointer' }}>
                    <input type="checkbox" checked={eventConsents.thirdparty} onChange={(e) => setEventConsents({ ...eventConsents, thirdparty: e.target.checked })} className="accent-[#0f6e56]" />
                    [필수] 제3자 제공 동의 (잇다랩)
                  </label>
                )}
                {[
                  { key: "ad_sms", label: "[선택] 광고 수신 동의 (문자)" },
                  { key: "ad_kakao", label: "[선택] 광고 수신 동의 (카카오)" },
                  { key: "ad_email", label: "[선택] 광고 수신 동의 (이메일)" },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c2c2a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={eventConsents[key as keyof EventConsents]}
                      onChange={(e) => setEventConsents({ ...eventConsents, [key]: e.target.checked })}
                      className="accent-[#0f6e56]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#888780' }}>이미 필수 동의를 완료하셨어요. 바로 참여할 수 있어요.</p>
            )}

            {eventError && <p style={{ fontSize: 12, color: '#d32f2f' }}>{eventError}</p>}

            <PrimaryButton disabled={eventSubmitting}>
              {eventSubmitting ? "제출 중..." : "이벤트 참여하기"}
            </PrimaryButton>
          </form>
        </div>
      </main>
    );
  }

  // ── Event B3: pending / approved (SP-E3, coupon shown only after staff approval) ──
  if (showEventGate && eventJoinStep === "b3") {
    const status = participation?.status ?? "pending";
    const approved = status === "approved" && !!participation?.coupon;

    return (
      <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
          <p style={{ fontSize: 12, color: '#e1f5ee' }}>{activeEvent?.title ?? "이벤트 참여"}</p>
        </header>

        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {approved ? (
            <div style={{ background: '#e1f5ee', border: '2px dashed #0f6e56', borderRadius: 12, padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>승인되었습니다! 🎉</p>
              <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: '#0f6e56' }}>{participation!.coupon!.code}</p>
              {participation!.coupon!.benefit && <p style={{ fontSize: 14, color: '#085041' }}>{participation!.coupon!.benefit}</p>}
              <p style={{ fontSize: 12, color: '#888780' }}>사장님께 이 코드를 보여주세요.</p>
            </div>
          ) : (
            <div style={{ background: '#f8f7f4', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#2c2c2a' }}>직원 확인 중입니다</p>
              <p style={{ fontSize: 13, color: '#888780' }}>잠시만 기다려 주세요. 직원이 확인하면 자동으로 갱신됩니다.</p>
            </div>
          )}

          {upcomingPreannounce.length > 0 && (
            <div style={{ background: '#faeeda', border: '1px solid #f0d9a8', borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#633806', marginBottom: 8 }}>다가오는 이벤트</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {upcomingPreannounce.map((e) => (
                  <p key={e.id} style={{ fontSize: 13, color: '#633806' }}>
                    {e.title}
                    {e.start_at ? ` · ${new Date(e.start_at).toLocaleDateString("ko-KR")}` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── B3: Stamp board ────────────────────────────────────────
  if (step === "b3") {
    const visitCount = checkInResult?.visit_count ?? 0;
    const required = stampsPolicy.required_count;
    const newCoupon = checkInResult?.accrued ? checkInResult.coupon : null;
    const referLink = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${storeCode}?ref=${encodeURIComponent(document.cookie.replace(/.*dangol_bt=([^;]+).*/, "$1"))}`;

    return (
      <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
          <p style={{ fontSize: 12, color: '#e1f5ee' }}>단골 스탬프 카드 · {visitCount}번째 방문</p>
        </header>

        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {checkInResult?.accrued ? (
            <div style={{ background: '#e1f5ee', border: '1px solid #9fe1cb', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>🎉 {visitCount}번째 방문입니다!</p>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: '#888780' }}>오늘은 이미 방문 도장을 받으셨어요.</p>
          )}

          {/* Stamp board */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#633806', marginBottom: 12 }}>스탬프 현황</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {Array.from({ length: required }).map((_, i) => (
                <div
                  key={i}
                  style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: i < visitCount % required ? '#0f6e56' : '#fff', border: `1px solid ${i < visitCount % required ? '#0f6e56' : '#e5e5e0'}`, color: i < visitCount % required ? '#fff' : '#888780' }}
                >
                  {i < visitCount % required ? "★" : "☆"}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#888780' }}>
              {visitCount}번 방문 · {required - (visitCount % required)}번 더 오시면 리워드!
            </p>
          </div>

          {/* New coupon */}
          {newCoupon && (
            <div style={{ background: '#e1f5ee', border: '2px dashed #0f6e56', borderRadius: 12, padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>재방문 쿠폰이 발급되었습니다!</p>
              <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: '#0f6e56' }}>{newCoupon.code}</p>
              <p style={{ fontSize: 14, color: '#085041' }}>{newCoupon.benefit}</p>
              <p style={{ fontSize: 12, color: '#888780' }}>사장님께 이 코드를 보여주세요.</p>
            </div>
          )}

          {/* My coupon wallet */}
          {myCoupons.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#2c2c2a', marginBottom: 12 }}>내 쿠폰</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myCoupons.map((c) => (
                  <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid #e5e5e0' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, letterSpacing: 4, color: '#085041' }}>{c.code}</p>
                    <p style={{ fontSize: 12, color: '#888780' }}>{c.benefit}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refer-a-friend */}
          <div style={{ background: '#e1f5ee', border: '1px solid #9fe1cb', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#085041', marginBottom: 4 }}>친구 초대 링크</p>
            <p style={{ fontSize: 12, color: '#5f5e5a', marginBottom: 12 }}>친구가 이 링크로 가입하면 둘 다 쿠폰을 받아요!</p>
            <button
              style={{ border: '1px solid #e5e5e0', borderRadius: 8, padding: '12px 20px', color: '#5f5e5a', background: '#fff', fontSize: 14, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
              onClick={() => {
                navigator.clipboard?.writeText(referLink).then(() => alert("링크 복사됨!")).catch(() => {});
              }}
            >
              링크 복사
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── B1: Visit purpose question ─────────────────────────────
  if (step === "b1") {
    return (
      <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
          <p style={{ fontSize: 12, color: '#e1f5ee' }}>단골 쿠폰 등록</p>
        </header>

        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {eventClosedNotice && (
            <p style={{ fontSize: 12, color: '#888780', background: '#f8f7f4', border: '1px solid #e5e5e0', borderRadius: 8, padding: '8px 12px' }}>
              이벤트가 마감되었습니다.
            </p>
          )}
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2c2c2a' }}>오늘 어떤 날이세요?</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {VISIT_PURPOSES.map((p) => (
              <button
                key={p}
                onClick={() => setVisitPurpose(p)}
                style={{ background: visitPurpose === p ? '#e1f5ee' : '#fff', border: `1px solid ${visitPurpose === p ? '#9fe1cb' : '#e5e5e0'}`, color: visitPurpose === p ? '#085041' : '#2c2c2a', borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
              >
                {p}
              </button>
            ))}
          </div>
          <PrimaryButton disabled={!visitPurpose} onClick={handleB1Next}>
            다음
          </PrimaryButton>
        </div>
      </main>
    );
  }

  // ── B2: Contact + Consent ──────────────────────────────────
  if (step === "b2") {
    return (
      <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
          <p style={{ fontSize: 12, color: '#e1f5ee' }}>쿠폰 받을 곳</p>
        </header>

        <div style={{ flex: 1, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#2c2c2a', marginBottom: 16 }}>쿠폰을 받으실 연락처를 입력해 주세요</h2>
          <form onSubmit={handleB2Submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {(["phone", "kakao", "email"] as Channel[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  style={{ flex: 1, background: channel === ch ? '#0f6e56' : '#fff', color: channel === ch ? '#fff' : '#5f5e5a', border: `1px solid ${channel === ch ? '#0f6e56' : '#e5e5e0'}`, borderRadius: 999, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>

            <Input
              type={channel === "email" ? "email" : "text"}
              placeholder={CHANNEL_PLACEHOLDERS[channel]}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <Input
              type="text"
              placeholder="이름 (선택)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div style={{ background: '#f8f7f4', border: '1px solid #e5e5e0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#5f5e5a' }}>동의 항목</p>
              {[
                { key: "required", label: "[필수] 개인정보 수집·이용 동의" },
                { key: "thirdparty", label: "[선택] 제3자 제공 동의 (잇다랩)" },
                { key: "ad_sms", label: "[선택] 광고 수신 동의 (문자)" },
                { key: "ad_kakao", label: "[선택] 광고 수신 동의 (카카오)" },
                { key: "ad_email", label: "[선택] 광고 수신 동의 (이메일)" },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2c2c2a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={consents[key as keyof typeof consents]}
                    onChange={(e) => setConsents({ ...consents, [key]: e.target.checked })}
                    className="accent-[#0f6e56]"
                  />
                  {label}
                </label>
              ))}
            </div>

            {errorMsg && <p style={{ fontSize: 12, color: '#d32f2f' }}>{errorMsg}</p>}

            <button
              type="submit"
              disabled={submitting}
              style={{ background: '#ef9f27', color: '#633806', borderRadius: 8, padding: '16px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "제출 중..." : "쿠폰 받기"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ── Done: First coupon issued ──────────────────────────────
  return (
    <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{storeName}</p>
        <p style={{ fontSize: 12, color: '#e1f5ee' }}>단골 쿠폰 등록 완료</p>
      </header>
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2c2c2a' }}>환영합니다! 🎉</h2>
        <p style={{ fontSize: 14, color: '#5f5e5a' }}>첫 방문 쿠폰이 발급되었습니다.</p>
        <div style={{ background: '#e1f5ee', border: '2px dashed #0f6e56', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: '#0f6e56' }}>{couponCode}</p>
        </div>
        <p style={{ fontSize: 14, color: '#888780', textAlign: 'center' }}>사장님께 이 코드를 보여주세요.</p>
      </div>
    </main>
  );
}
