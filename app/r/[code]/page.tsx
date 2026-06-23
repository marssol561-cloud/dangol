"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Input from "@/app/components/ui/Input";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

type Step = "loading" | "b1" | "b2" | "b3" | "done" | "error";
type Channel = "phone" | "kakao" | "email";
type VisitPurpose = "혼밥" | "친구" | "연인" | "가족" | "기념일";

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

  // ── B3: Stamp board ────────────────────────────────────────
  if (step === "b3") {
    const visitCount = checkInResult?.visit_count ?? 0;
    const required = stampsPolicy.required_count;
    const newCoupon = checkInResult?.accrued ? checkInResult.coupon : null;
    const referLink = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${storeCode}?ref=${encodeURIComponent(document.cookie.replace(/.*dangol_bt=([^;]+).*/, "$1"))}`;

    return (
      <main className="min-h-screen bg-[#f8f7f4] flex flex-col">
        <header className="bg-[#0f6e56] px-5 py-5">
          <p className="font-bold text-base text-white">{storeName}</p>
          <p className="text-xs text-[#e1f5ee] mt-0.5">단골 스탬프 카드</p>
        </header>

        <div className="flex-1 p-5 flex flex-col gap-4">
          {checkInResult?.accrued ? (
            <div className="bg-[#e1f5ee] border border-[#9fe1cb] rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-[#085041]">🎉 {visitCount}번째 방문입니다!</p>
            </div>
          ) : (
            <p className="text-sm text-[#888780]">오늘은 이미 방문 도장을 받으셨어요.</p>
          )}

          {/* Stamp board */}
          <div className="bg-white border border-[#e5e5e0] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#2c2c2a] mb-3">스탬프 현황</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {Array.from({ length: required }).map((_, i) => (
                <div
                  key={i}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-lg border-2 ${
                    i < visitCount % required
                      ? "border-[#0f6e56] text-[#0f6e56] bg-[#e1f5ee]"
                      : "border-[#e5e5e0] text-[#e5e5e0]"
                  }`}
                >
                  {i < visitCount % required ? "★" : "☆"}
                </div>
              ))}
            </div>
            <p className="text-xs text-[#888780]">
              {visitCount}번 방문 · {required - (visitCount % required)}번 더 오시면 리워드!
            </p>
          </div>

          {/* New coupon */}
          {newCoupon && (
            <div className="bg-[#e1f5ee] border-2 border-dashed border-[#0f6e56] rounded-xl p-5 text-center flex flex-col gap-2">
              <p className="text-sm font-semibold text-[#085041]">재방문 쿠폰이 발급되었습니다!</p>
              <p className="text-[28px] font-black tracking-widest text-[#0f6e56]">{newCoupon.code}</p>
              <p className="text-sm text-[#085041]">{newCoupon.benefit}</p>
              <p className="text-xs text-[#888780]">사장님께 이 코드를 보여주세요.</p>
            </div>
          )}

          {/* My coupon wallet */}
          {myCoupons.length > 0 && (
            <div className="bg-white border border-[#e5e5e0] rounded-xl p-5">
              <p className="text-sm font-semibold text-[#2c2c2a] mb-3">내 쿠폰</p>
              <div className="flex flex-col gap-2">
                {myCoupons.map((c) => (
                  <div key={c.code} className="flex justify-between items-center py-2 border-b border-[#e5e5e0] last:border-0">
                    <p className="text-base font-bold tracking-widest text-[#085041]">{c.code}</p>
                    <p className="text-xs text-[#888780]">{c.benefit}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refer-a-friend */}
          <div className="bg-[#faeeda] border border-[#ef9f27] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#633806] mb-1">친구 초대 링크</p>
            <p className="text-xs text-[#633806] mb-3">친구가 이 링크로 가입하면 둘 다 쿠폰을 받아요!</p>
            <button
              className="bg-[#ef9f27] text-[#633806] font-semibold text-sm rounded-lg py-2.5 w-full cursor-pointer"
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
      <main className="min-h-screen bg-[#f8f7f4] flex flex-col">
        <header className="bg-[#0f6e56] px-5 py-5">
          <p className="font-bold text-base text-white">{storeName}</p>
          <p className="text-xs text-[#e1f5ee] mt-0.5">단골 쿠폰 등록</p>
        </header>

        <div className="flex-1 p-5 flex flex-col gap-5">
          <h2 className="text-xl font-semibold text-[#2c2c2a]">오늘 어떤 날이세요?</h2>
          <div className="flex flex-wrap gap-2">
            {VISIT_PURPOSES.map((p) => (
              <button
                key={p}
                onClick={() => setVisitPurpose(p)}
                className={`px-5 py-2.5 rounded-full border-2 text-sm font-medium cursor-pointer transition-colors ${
                  visitPurpose === p
                    ? "border-[#0f6e56] bg-[#e1f5ee] text-[#085041]"
                    : "border-[#e5e5e0] bg-white text-[#5f5e5a]"
                }`}
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
      <main className="min-h-screen bg-[#f8f7f4] flex flex-col">
        <header className="bg-[#0f6e56] px-5 py-5">
          <p className="font-bold text-base text-white">{storeName}</p>
          <p className="text-xs text-[#e1f5ee] mt-0.5">단골 쿠폰 등록</p>
        </header>

        <div className="flex-1 p-5">
          <h2 className="text-lg font-semibold text-[#2c2c2a] mb-4">쿠폰을 받으실 연락처를 입력해 주세요</h2>
          <form onSubmit={handleB2Submit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              {(["phone", "kakao", "email"] as Channel[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium cursor-pointer transition-colors ${
                    channel === ch
                      ? "border-[#0f6e56] bg-[#e1f5ee] text-[#085041]"
                      : "border-[#e5e5e0] bg-white text-[#5f5e5a]"
                  }`}
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

            <fieldset className="border border-[#e5e5e0] rounded-lg p-4">
              <legend className="text-xs font-semibold text-[#5f5e5a] px-1">동의 항목</legend>
              <div className="flex flex-col gap-2 mt-1">
                {[
                  { key: "required", label: "[필수] 개인정보 수집·이용 동의" },
                  { key: "thirdparty", label: "[선택] 제3자 제공 동의 (잇다랩)" },
                  { key: "ad_sms", label: "[선택] 광고 수신 동의 (문자)" },
                  { key: "ad_kakao", label: "[선택] 광고 수신 동의 (카카오)" },
                  { key: "ad_email", label: "[선택] 광고 수신 동의 (이메일)" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-[#2c2c2a] cursor-pointer">
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
            </fieldset>

            {errorMsg && <p className="text-xs text-[#d32f2f]">{errorMsg}</p>}

            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? "제출 중..." : "쿠폰 받기"}
            </PrimaryButton>
          </form>
        </div>
      </main>
    );
  }

  // ── Done: First coupon issued ──────────────────────────────
  return (
    <main className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <header className="bg-[#0f6e56] px-5 py-5">
        <p className="font-bold text-base text-white">{storeName}</p>
        <p className="text-xs text-[#e1f5ee] mt-0.5">단골 쿠폰 등록 완료</p>
      </header>
      <div className="flex-1 p-5 flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-[#2c2c2a]">환영합니다! 🎉</h2>
        <p className="text-sm text-[#5f5e5a]">첫 방문 쿠폰이 발급되었습니다.</p>
        <div className="bg-[#e1f5ee] border-2 border-dashed border-[#0f6e56] rounded-xl p-6 text-center">
          <p className="text-[28px] font-black tracking-widest text-[#0f6e56]">{couponCode}</p>
        </div>
        <p className="text-sm text-[#888780] text-center">사장님께 이 코드를 보여주세요.</p>
      </div>
    </main>
  );
}
