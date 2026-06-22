"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

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

    // 1. Load store name
    fetch(`/api/r/${storeCode}/store`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d.store_name === undefined) {
          setStep("error");
          setErrorMsg("유효하지 않은 QR 코드입니다.");
          return;
        }
        setStoreName(d.store_name);

        // 2. Try check-in (returning customer)
        const ciRes = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_code: storeCode }),
        });
        const ci: CheckInResult = await ciRes.json();

        if (ci.accrued || ci.reason === "too_soon") {
          // Returning customer — go to B3
          setCheckInResult(ci);

          // Fetch stamps policy
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
          // New visitor — B1 flow
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
      <main style={styles.container}>
        <p style={styles.muted}>불러오는 중...</p>
      </main>
    );
  }

  if (step === "error") {
    return (
      <main style={styles.container}>
        <p style={styles.error}>{errorMsg || "오류가 발생했습니다."}</p>
      </main>
    );
  }

  // ── B3: Stamp board (returning customer) ──────────────────
  if (step === "b3") {
    const visitCount = checkInResult?.visit_count ?? 0;
    const required = stampsPolicy.required_count;
    const newCoupon = checkInResult?.accrued ? checkInResult.coupon : null;
    const referLink = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${storeCode}?ref=${encodeURIComponent(document.cookie.replace(/.*dangol_bt=([^;]+).*/, "$1"))}`;

    return (
      <main style={styles.container}>
        <h1 style={styles.storeName}>{storeName}</h1>

        {checkInResult?.accrued ? (
          <p style={styles.accrualMsg}>🎉 {visitCount}번째 방문입니다!</p>
        ) : (
          <p style={styles.muted}>오늘은 이미 방문 도장을 받으셨어요.</p>
        )}

        {/* Stamp board */}
        <div style={styles.stampSection}>
          <p style={styles.sectionTitle}>스탬프 현황</p>
          <div style={styles.stampGrid}>
            {Array.from({ length: required }).map((_, i) => (
              <div
                key={i}
                style={{
                  ...styles.stamp,
                  ...(i < visitCount % required ? styles.stampFilled : {}),
                }}
              >
                {i < visitCount % required ? "★" : "☆"}
              </div>
            ))}
          </div>
          <p style={styles.muted}>
            {visitCount}번 방문 · {required - (visitCount % required)}번 더 오시면 리워드!
          </p>
        </div>

        {/* New coupon */}
        {newCoupon && (
          <div style={styles.couponBox}>
            <p style={styles.sectionTitle}>재방문 쿠폰이 발급되었습니다!</p>
            <span style={styles.couponCode}>{newCoupon.code}</span>
            <p style={styles.muted}>{newCoupon.benefit}</p>
            <p style={styles.muted}>사장님께 이 코드를 보여주세요.</p>
          </div>
        )}

        {/* My coupon wallet */}
        {myCoupons.length > 0 && (
          <div style={styles.walletSection}>
            <p style={styles.sectionTitle}>내 쿠폰</p>
            {myCoupons.map((c) => (
              <div key={c.code} style={styles.walletCoupon}>
                <span style={styles.couponCodeSmall}>{c.code}</span>
                <span style={styles.muted}>{c.benefit}</span>
              </div>
            ))}
          </div>
        )}

        {/* Refer-a-friend */}
        <div style={styles.referSection}>
          <p style={styles.sectionTitle}>친구 초대 링크</p>
          <p style={styles.muted}>친구가 이 링크로 가입하면 둘 다 쿠폰을 받아요!</p>
          <button
            style={styles.copyBtn}
            onClick={() => {
              navigator.clipboard?.writeText(referLink).then(() => alert("링크 복사됨!")).catch(() => {});
            }}
          >
            링크 복사
          </button>
        </div>
      </main>
    );
  }

  // ── B1: Veil question ──────────────────────────────────────
  if (step === "b1") {
    return (
      <main style={styles.container}>
        <h1 style={styles.storeName}>{storeName}</h1>
        <h2 style={styles.question}>오늘 어떤 날이세요?</h2>
        <div style={styles.purposeGrid}>
          {VISIT_PURPOSES.map((p) => (
            <button
              key={p}
              style={{
                ...styles.purposeBtn,
                ...(visitPurpose === p ? styles.purposeBtnActive : {}),
              }}
              onClick={() => setVisitPurpose(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          style={{ ...styles.primaryBtn, opacity: visitPurpose ? 1 : 0.4 }}
          disabled={!visitPurpose}
          onClick={handleB1Next}
        >
          다음
        </button>
      </main>
    );
  }

  // ── B2: Contact + Consent ──────────────────────────────────
  if (step === "b2") {
    return (
      <main style={styles.container}>
        <h1 style={styles.storeName}>{storeName}</h1>
        <h2 style={styles.question}>쿠폰을 받으실 연락처를 입력해 주세요</h2>
        <form onSubmit={handleB2Submit} style={styles.form}>
          <div style={styles.channelRow}>
            {(["phone", "kakao", "email"] as Channel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                style={{
                  ...styles.channelBtn,
                  ...(channel === ch ? styles.channelBtnActive : {}),
                }}
                onClick={() => setChannel(ch)}
              >
                {CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>

          <input
            style={styles.input}
            type={channel === "email" ? "email" : "text"}
            placeholder={CHANNEL_PLACEHOLDERS[channel]}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />

          <input
            style={styles.input}
            type="text"
            placeholder="이름 (선택)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>동의 항목</legend>
            {[
              { key: "required", label: "[필수] 개인정보 수집·이용 동의" },
              { key: "thirdparty", label: "[선택] 제3자 제공 동의 (잇다랩)" },
              { key: "ad_sms", label: "[선택] 광고 수신 동의 (문자)" },
              { key: "ad_kakao", label: "[선택] 광고 수신 동의 (카카오)" },
              { key: "ad_email", label: "[선택] 광고 수신 동의 (이메일)" },
            ].map(({ key, label }) => (
              <label key={key} style={styles.consentLabel}>
                <input
                  type="checkbox"
                  checked={consents[key as keyof typeof consents]}
                  onChange={(e) => setConsents({ ...consents, [key]: e.target.checked })}
                />
                &nbsp;{label}
              </label>
            ))}
          </fieldset>

          {errorMsg && <p style={styles.error}>{errorMsg}</p>}

          <button
            type="submit"
            style={{ ...styles.primaryBtn, opacity: submitting ? 0.6 : 1 }}
            disabled={submitting}
          >
            {submitting ? "제출 중..." : "쿠폰 받기"}
          </button>
        </form>
      </main>
    );
  }

  // ── Done: First coupon issued ──────────────────────────────
  return (
    <main style={styles.container}>
      <h1 style={styles.storeName}>{storeName}</h1>
      <h2 style={styles.question}>환영합니다! 🎉</h2>
      <p style={styles.muted}>첫 방문 쿠폰이 발급되었습니다.</p>
      <div style={styles.couponBox}>
        <span style={styles.couponCode}>{couponCode}</span>
      </div>
      <p style={styles.muted}>사장님께 이 코드를 보여주세요.</p>
    </main>
  );
}

// ── Inline styles ──────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "40px 24px",
    fontFamily: "sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  storeName: { fontSize: 22, fontWeight: 700, margin: 0 },
  question: { fontSize: 18, fontWeight: 600, margin: 0 },
  accrualMsg: { fontSize: 18, fontWeight: 700, color: "#005555", margin: 0 },
  sectionTitle: { fontSize: 15, fontWeight: 700, margin: 0 },
  purposeGrid: { display: "flex", flexWrap: "wrap", gap: 10 },
  purposeBtn: {
    padding: "10px 18px",
    borderRadius: 24,
    border: "1.5px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    fontSize: 15,
  },
  purposeBtnActive: {
    border: "1.5px solid #008080",
    background: "#e6f7f7",
    color: "#005555",
    fontWeight: 600,
  },
  primaryBtn: {
    padding: "14px 0",
    borderRadius: 10,
    border: "none",
    background: "#008080",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
  },
  channelRow: { display: "flex", gap: 8 },
  channelBtn: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 8,
    border: "1.5px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
  },
  channelBtnActive: {
    border: "1.5px solid #008080",
    background: "#e6f7f7",
    color: "#005555",
    fontWeight: 700,
  },
  input: {
    padding: "12px 14px",
    borderRadius: 8,
    border: "1.5px solid #ddd",
    fontSize: 15,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  fieldset: { border: "1px solid #eee", borderRadius: 8, padding: 14 },
  legend: { fontWeight: 600, fontSize: 14, padding: "0 6px" },
  consentLabel: { display: "block", fontSize: 14, marginBottom: 8 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  couponBox: {
    background: "#f0fafa",
    border: "2px dashed #008080",
    borderRadius: 12,
    padding: "20px 0",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
  couponCode: { fontSize: 28, fontWeight: 800, letterSpacing: 4, color: "#005555" },
  couponCodeSmall: { fontSize: 18, fontWeight: 700, letterSpacing: 2, color: "#005555" },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  error: { color: "#c00", fontSize: 14, margin: 0 },
  stampSection: {
    background: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  stampGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  stamp: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "2px solid #ccc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    color: "#ccc",
  },
  stampFilled: { border: "2px solid #008080", color: "#008080", background: "#e6f7f7" },
  walletSection: {
    background: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  walletCoupon: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #eee",
  },
  referSection: {
    background: "#fffbf0",
    border: "1px solid #f5c518",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  copyBtn: {
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "#f5c518",
    color: "#333",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};
