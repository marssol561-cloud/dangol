"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

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
    return <div className="text-[#888780] text-sm">확인 중…</div>;
  }

  if (state === "error") {
    return (
      <div className="bg-white border border-[#e5e5e0] rounded-xl p-8 max-w-sm w-full text-center">
        <p className="text-lg font-semibold text-[#2c2c2a] mb-2">링크가 유효하지 않습니다</p>
        <p className="text-sm text-[#888780]">
          이미 처리되었거나 잘못된 링크입니다.
          <br />문의: 해당 매장에 직접 연락해 주세요.
        </p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="bg-white border border-[#e5e5e0] rounded-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4 text-[#0f6e56]">✓</div>
        <p className="text-lg font-semibold text-[#2c2c2a] mb-2">처리 완료</p>
        <p className="text-sm text-[#888780]">
          요청하신 내용이 반영되었습니다.
          {withdrawRequired && (
            <span className="block mt-2 text-[#ef9f27]">
              개인정보 수집 동의를 철회하셨습니다. 영업일 기준 처리됩니다.
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 max-w-sm w-full">
      <h1 className="text-lg font-semibold text-[#2c2c2a] mb-1">수신 설정</h1>
      <p className="text-sm text-[#888780] mb-6">원하시는 항목을 선택 후 아래 버튼을 누르세요.</p>

      {/* Ad channel opt-out toggles */}
      <section className="mb-6">
        <p className="text-xs font-medium text-[#888780] uppercase tracking-wider mb-3">광고 수신 거부</p>
        {(["sms", "kakao", "email"] as Channel[]).map((ch) => {
          const isChecked = optedOut.includes(ch);
          return (
            <label key={ch} className="flex items-center justify-between py-3 border-b border-[#e5e5e0] cursor-pointer">
              <span className="text-sm text-[#2c2c2a]">{CHANNEL_LABELS[ch]}</span>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() =>
                  setOptedOut((prev) =>
                    isChecked ? prev.filter((c) => c !== ch) : [...prev, ch]
                  )
                }
                className="w-4 h-4 accent-[#0f6e56]"
              />
            </label>
          );
        })}
      </section>

      {/* Consent withdrawal */}
      <section className="mb-6">
        <p className="text-xs font-medium text-[#888780] uppercase tracking-wider mb-3">동의 철회</p>
        {data?.activeConsents.thirdparty && (
          <label className="flex items-center justify-between py-3 border-b border-[#e5e5e0] cursor-pointer">
            <div>
              <span className="text-sm text-[#2c2c2a] block">제3자 제공 동의 철회</span>
              <span className="text-xs text-[#888780]">멀티 매장 혜택 서비스에서 제외됩니다</span>
            </div>
            <input
              type="checkbox"
              checked={withdrawThirdparty}
              onChange={() => setWithdrawThirdparty((v) => !v)}
              className="w-4 h-4 accent-[#0f6e56]"
            />
          </label>
        )}
        <label className="flex items-center justify-between py-3 cursor-pointer">
          <div>
            <span className="text-sm text-[#d32f2f] block font-medium">개인정보 수집 동의 철회</span>
            <span className="text-xs text-[#888780]">모든 서비스 이용이 중단되고 데이터가 삭제됩니다</span>
          </div>
          <input
            type="checkbox"
            checked={withdrawRequired}
            onChange={() => setWithdrawRequired((v) => !v)}
            className="w-4 h-4 accent-[#d32f2f]"
          />
        </label>
      </section>

      <PrimaryButton
        onClick={handleSubmit}
        disabled={submitting || (optedOut.length === 0 && !withdrawThirdparty && !withdrawRequired)}
      >
        {submitting ? "처리 중…" : "적용하기"}
      </PrimaryButton>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f7f4] p-4">
      <Suspense fallback={<div className="text-[#888780] text-sm">확인 중…</div>}>
        <UnsubscribeContent />
      </Suspense>
    </main>
  );
}
