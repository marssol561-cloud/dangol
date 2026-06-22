"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Step = "b1" | "b2" | "done" | "error";
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

export default function CustomerPage() {
  const params = useParams<{ code: string }>();
  const storeCode = params?.code ?? "";

  const [step, setStep] = useState<Step>("b1");
  const [storeName, setStoreName] = useState<string>("");
  const [storeLoading, setStoreLoading] = useState(true);

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

  useEffect(() => {
    if (!storeCode) return;
    fetch(`/api/r/${storeCode}/store`)
      .then((r) => r.json())
      .then((d) => {
        if (d.store_name !== undefined) {
          setStoreName(d.store_name);
        } else {
          setStep("error");
          setErrorMsg("유효하지 않은 QR 코드입니다.");
        }
      })
      .catch(() => {
        setStep("error");
        setErrorMsg("매장 정보를 불러오지 못했습니다.");
      })
      .finally(() => setStoreLoading(false));
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

  if (storeLoading) {
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
          {/* Channel selector */}
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

          {/* Identifier input */}
          <input
            style={styles.input}
            type={channel === "email" ? "email" : "text"}
            placeholder={CHANNEL_PLACEHOLDERS[channel]}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />

          {/* Name (optional) */}
          <input
            style={styles.input}
            type="text"
            placeholder="이름 (선택)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Consents */}
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>동의 항목</legend>
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consents.required}
                onChange={(e) => setConsents({ ...consents, required: e.target.checked })}
              />
              &nbsp;[필수] 개인정보 수집·이용 동의
            </label>
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consents.thirdparty}
                onChange={(e) => setConsents({ ...consents, thirdparty: e.target.checked })}
              />
              &nbsp;[선택] 제3자 제공 동의 (잇다랩)
            </label>
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consents.ad_sms}
                onChange={(e) => setConsents({ ...consents, ad_sms: e.target.checked })}
              />
              &nbsp;[선택] 광고 수신 동의 (문자)
            </label>
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consents.ad_kakao}
                onChange={(e) => setConsents({ ...consents, ad_kakao: e.target.checked })}
              />
              &nbsp;[선택] 광고 수신 동의 (카카오)
            </label>
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consents.ad_email}
                onChange={(e) => setConsents({ ...consents, ad_email: e.target.checked })}
              />
              &nbsp;[선택] 광고 수신 동의 (이메일)
            </label>
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

  // ── Done: Coupon issued ────────────────────────────────────
  return (
    <main style={styles.container}>
      <h1 style={styles.storeName}>{storeName}</h1>
      <h2 style={styles.question}>환영합니다! 🎉</h2>
      <p style={styles.muted}>첫 방문 쿠폰이 발급되었습니다.</p>
      <div style={styles.couponBox}>
        <span style={styles.couponCode}>{couponCode}</span>
      </div>
      <p style={styles.muted}>사장님께 이 코드를 보여주세요.</p>
      {/* SP-4: 스탬프 보드로 연결 예정 */}
      <p style={{ ...styles.muted, marginTop: 32, fontSize: 13 }}>
        스탬프 보드는 준비 중입니다.
      </p>
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
  },
  couponCode: { fontSize: 28, fontWeight: 800, letterSpacing: 4, color: "#005555" },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  error: { color: "#c00", fontSize: 14, margin: 0 },
};
