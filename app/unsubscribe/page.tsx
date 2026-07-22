"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Channel = "sms" | "kakao" | "email";

interface UnsubData {
  customerId: string;
  storeLinkId: string;
  activeConsents: {
    ad_sms: boolean;
    ad_kakao: boolean;
    ad_email: boolean;
    thirdparty: boolean;
  };
}

type PageState = "loading" | "error" | "form" | "done";

const CHANNEL_LABELS: Record<Channel, string> = {
  sms: "SMS 문자 수신",
  kakao: "카카오 알림 수신",
  email: "이메일 수신",
};

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? "";

  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<UnsubData | null>(null);
  const [optedOut, setOptedOut] = useState<Channel[]>([]);
  const [withdrawThirdparty, setWithdrawThirdparty] = useState(false);
  const [withdrawRequired, setWithdrawRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional init branch: no token → error state
      setState("error");
      return;
    }
    fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setState("error");
        } else {
          setData(json as UnsubData);
          setState("form");
        }
      })
      .catch(() => setState("error"));
  }, [token]);

  async function handleSubmit() {
    if (!data) return;
    setSubmitting(true);
    const body = {
      token,
      optOut: optedOut,
      withdraw: [
        ...(withdrawThirdparty ? ["thirdparty"] : []),
        ...(withdrawRequired ? ["required"] : []),
      ],
    };
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (res.ok) {
      setState("done");
    } else {
      alert("처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  if (state === "loading") {
    return <p style={{ fontSize: 14, color: '#888780' }}>확인 중…</p>;
  }

  if (state === "error") {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#2c2c2a', marginBottom: 8 }}>링크가 유효하지 않습니다</p>
        <p style={{ fontSize: 14, color: '#888780' }}>이미 처리되었거나 잘못된 링크입니다.<br />문의: 해당 매장에 직접 연락해 주세요.</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 36, color: '#0f6e56', marginBottom: 16 }}>✓</div>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#2c2c2a', marginBottom: 8 }}>처리 완료</p>
        <p style={{ fontSize: 14, color: '#888780' }}>
          요청하신 내용이 반영되었습니다.
          {withdrawRequired && (
            <span style={{ display: 'block', marginTop: 8, color: '#ef9f27' }}>
              개인정보 수집 동의를 철회하셨습니다. 영업일 기준 처리됩니다.
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 14, color: '#888780' }}>원하시는 항목을 선택 후 아래 버튼을 누르세요.</p>

      {/* Ad channel opt-out toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#888780', textTransform: 'uppercase' }}>광고 수신 거부</p>
        {(["sms", "kakao", "email"] as Channel[]).map((ch) => {
          const isChecked = optedOut.includes(ch);
          return (
            <label key={ch} style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, color: '#2c2c2a' }}>{CHANNEL_LABELS[ch]}</span>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => setOptedOut((prev) => isChecked ? prev.filter((c) => c !== ch) : [...prev, ch])}
                className="accent-[#0f6e56]"
                style={{ width: 18, height: 18 }}
              />
            </label>
          );
        })}
      </div>

      {/* Consent withdrawal */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#888780', textTransform: 'uppercase' }}>동의 철회</p>
        {data?.activeConsents.thirdparty && (
          <label style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <span style={{ fontSize: 14, color: '#2c2c2a', display: 'block' }}>제3자 제공 동의 철회</span>
              <span style={{ fontSize: 12, color: '#888780' }}>멀티 매장 혜택 서비스에서 제외됩니다</span>
            </div>
            <input type="checkbox" checked={withdrawThirdparty} onChange={() => setWithdrawThirdparty((v) => !v)} className="accent-[#0f6e56]" style={{ width: 18, height: 18 }} />
          </label>
        )}
        <label style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <span style={{ fontSize: 14, color: '#d32f2f', fontWeight: 500, display: 'block' }}>개인정보 수집 동의 철회</span>
            <span style={{ fontSize: 12, color: '#888780' }}>모든 서비스 이용이 중단되고 데이터가 삭제됩니다</span>
          </div>
          <input type="checkbox" checked={withdrawRequired} onChange={() => setWithdrawRequired((v) => !v)} className="accent-[#d32f2f]" style={{ width: 18, height: 18 }} />
        </label>
      </div>

      <p style={{ fontSize: 12, color: '#888780' }}>변경 사항은 즉시 적용됩니다.</p>

      <button
        onClick={handleSubmit}
        disabled={submitting || (optedOut.length === 0 && !withdrawThirdparty && !withdrawRequired)}
        style={{ background: '#0f6e56', color: '#fff', borderRadius: 8, padding: '12px 20px', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', opacity: (submitting || (optedOut.length === 0 && !withdrawThirdparty && !withdrawRequired)) ? 0.6 : 1 }}
      >
        {submitting ? "처리 중…" : "적용하기"}
      </button>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#0f6e56', padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>단골 서비스</p>
        <p style={{ fontSize: 12, color: '#e1f5ee' }}>수신거부 · 동의철회</p>
      </header>
      <div style={{ flex: 1, padding: 20 }}>
        <Suspense fallback={<p style={{ fontSize: 14, color: '#888780' }}>확인 중…</p>}>
          <UnsubscribeContent />
        </Suspense>
      </div>
    </main>
  );
}
