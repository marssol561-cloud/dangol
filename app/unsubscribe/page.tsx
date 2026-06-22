"use client";

import { useEffect, useState } from "react";
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

export default function UnsubscribePage() {
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
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">확인 중…</p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <p className="text-lg font-semibold text-gray-800 mb-2">링크가 유효하지 않습니다</p>
          <p className="text-sm text-gray-500">
            이미 처리되었거나 잘못된 링크입니다.
            <br />문의: 해당 매장에 직접 연락해 주세요.
          </p>
        </div>
      </main>
    );
  }

  if (state === "done") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">✓</div>
          <p className="text-lg font-semibold text-gray-800 mb-2">처리 완료</p>
          <p className="text-sm text-gray-500">
            요청하신 내용이 반영되었습니다.
            {withdrawRequired && (
              <span className="block mt-2 text-amber-600">
                개인정보 수집 동의를 철회하셨습니다. 영업일 기준 처리됩니다.
              </span>
            )}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow p-6 max-w-sm w-full">
        <h1 className="text-lg font-semibold text-gray-800 mb-1">수신 설정</h1>
        <p className="text-sm text-gray-500 mb-6">원하시는 항목을 선택 후 아래 버튼을 누르세요.</p>

        {/* Ad channel opt-out toggles */}
        <section className="mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            광고 수신 거부
          </p>
          {(["sms", "kakao", "email"] as Channel[]).map((ch) => {
            const isChecked = optedOut.includes(ch);
            return (
              <label
                key={ch}
                className="flex items-center justify-between py-3 border-b border-gray-100 cursor-pointer"
              >
                <span className="text-sm text-gray-700">{CHANNEL_LABELS[ch]}</span>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() =>
                    setOptedOut((prev) =>
                      isChecked ? prev.filter((c) => c !== ch) : [...prev, ch]
                    )
                  }
                  className="w-4 h-4 accent-teal-600"
                />
              </label>
            );
          })}
        </section>

        {/* Consent withdrawal */}
        <section className="mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            동의 철회
          </p>
          {data?.activeConsents.thirdparty && (
            <label className="flex items-center justify-between py-3 border-b border-gray-100 cursor-pointer">
              <div>
                <span className="text-sm text-gray-700 block">제3자 제공 동의 철회</span>
                <span className="text-xs text-gray-400">멀티 매장 혜택 서비스에서 제외됩니다</span>
              </div>
              <input
                type="checkbox"
                checked={withdrawThirdparty}
                onChange={() => setWithdrawThirdparty((v) => !v)}
                className="w-4 h-4 accent-teal-600"
              />
            </label>
          )}
          <label className="flex items-center justify-between py-3 cursor-pointer">
            <div>
              <span className="text-sm text-red-600 block font-medium">개인정보 수집 동의 철회</span>
              <span className="text-xs text-gray-400">모든 서비스 이용이 중단되고 데이터가 삭제됩니다</span>
            </div>
            <input
              type="checkbox"
              checked={withdrawRequired}
              onChange={() => setWithdrawRequired((v) => !v)}
              className="w-4 h-4 accent-red-500"
            />
          </label>
        </section>

        <button
          onClick={handleSubmit}
          disabled={submitting || (optedOut.length === 0 && !withdrawThirdparty && !withdrawRequired)}
          className="w-full bg-teal-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
        >
          {submitting ? "처리 중…" : "적용하기"}
        </button>
      </div>
    </main>
  );
}
