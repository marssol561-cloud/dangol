"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AppHeader from "@/app/components/AppHeader";

const STEPS = [
  { label: "카카오 채널", desc: "카카오 비즈니스 채널 ID 입력" },
  { label: "발신번호", desc: "무상캐시 발신번호 등록" },
  { label: "Solapi 연결", desc: "Solapi API 키 입력 및 테스트" },
  { label: "리붐단골 연결", desc: "연결 완료" },
];

interface ChannelData {
  kakao_channel_id: string | null;
  sender_number: string | null;
  setup_step: number;
  connected: boolean;
  has_api_key: boolean;
}

const inputCls = "bg-white border border-[#e5e5e0] rounded-lg px-3 py-3 text-sm text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors w-full";

export default function SendSetupPage() {
  const [storeLinkId, setStoreLinkId] = useState("");
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [step, setStep] = useState(0);
  const [kakaoId, setKakaoId] = useState("");
  const [senderNum, setSenderNum] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const db = createBrowserClient(
    process.env.NEXT_PUBLIC_DANGOL_DB_URL!,
    process.env.NEXT_PUBLIC_DANGOL_DB_ANON_KEY!
  );

  async function loadChannel(slId: string, token: string) {
    const resp = await fetch(`/api/send-channels?store_link_id=${slId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const json = await resp.json() as { channel: ChannelData | null };
      if (json.channel) {
        setChannel(json.channel);
        setStep(json.channel.setup_step);
        setKakaoId(json.channel.kakao_channel_id ?? "");
        setSenderNum(json.channel.sender_number ?? "");
      }
    }
  }

  useEffect(() => {
    db.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: link } = await db.from("store_links").select("id").eq("owner_id", session.user.id).limit(1).single();
      if (!link) return;
      setStoreLinkId(link.id);
      await loadChannel(link.id, session.access_token);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(nextStep: number, extra: Record<string, unknown> = {}) {
    if (!storeLinkId) return;
    setSaving(true);
    setMsg("");

    const { data: { session } } = await db.auth.getSession();
    if (!session) { setSaving(false); return; }

    const resp = await fetch("/api/send-channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ store_link_id: storeLinkId, setup_step: nextStep, ...extra }),
    });

    const json = await resp.json();
    if (!resp.ok) {
      setMsg("오류: " + (json.error ?? "저장 실패"));
    } else {
      setStep(nextStep);
      setMsg("");
      if (nextStep === 4) {
        setChannel((c) => c ? { ...c, connected: true, setup_step: 4 } : c);
      }
    }
    setSaving(false);
  }

  const progressPct = Math.round((step / 4) * 100);

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="설정" />

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold text-[#2c2c2a] mb-6">메시지 발송 설정</h1>

        <div className="max-w-[560px]">
          {/* Progress bar */}
          <div className="bg-[#e5e5e0] rounded-full h-2 mb-6">
            <div
              className="bg-[#0f6e56] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex flex-col gap-3">
            {STEPS.map((s, i) => {
              const done = step > i;
              const active = step === i;
              return (
                <div
                  key={i}
                  className={`border rounded-xl p-5 transition-opacity ${
                    active ? "border-[#0f6e56] bg-[#e1f5ee]" :
                    done ? "border-[#9fe1cb] bg-[#f8f7f4]" :
                    "border-[#e5e5e0] bg-white opacity-50"
                  }`}
                >
                  <p className="font-semibold text-[#2c2c2a] mb-0.5">Step {i + 1}: {s.label}</p>
                  <p className="text-sm text-[#5f5e5a]">{s.desc}</p>

                  {active && i === 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <input value={kakaoId} onChange={(e) => setKakaoId(e.target.value)} placeholder="pfXXXXXXXXXXXXXXXX" className={inputCls} />
                      <button onClick={() => save(1, { kakao_channel_id: kakaoId })} disabled={saving} className="bg-[#0f6e56] text-white font-medium text-sm rounded-lg px-4 py-2.5 cursor-pointer disabled:opacity-60 self-start">
                        {saving ? "저장 중..." : "저장 후 다음"}
                      </button>
                      <p className="text-xs text-[#888780]">* 알림톡 미연결 시 SMS/이메일로 자동 전환됩니다.</p>
                    </div>
                  )}

                  {active && i === 1 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <input value={senderNum} onChange={(e) => setSenderNum(e.target.value)} placeholder="01012345678" className={inputCls} />
                      <button onClick={() => save(2, { sender_number: senderNum })} disabled={saving} className="bg-[#0f6e56] text-white font-medium text-sm rounded-lg px-4 py-2.5 cursor-pointer disabled:opacity-60 self-start">
                        {saving ? "저장 중..." : "저장 후 다음"}
                      </button>
                    </div>
                  )}

                  {active && i === 2 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Solapi API Secret Key" className={inputCls} />
                      <p className="text-xs text-[#888780]">* 키는 암호화 저장되며 이후 조회되지 않습니다.</p>
                      <button onClick={() => save(3, { api_key: apiKey })} disabled={saving || !apiKey} className="bg-[#0f6e56] text-white font-medium text-sm rounded-lg px-4 py-2.5 cursor-pointer disabled:opacity-60 self-start">
                        {saving ? "저장 중..." : "저장 후 다음"}
                      </button>
                    </div>
                  )}

                  {active && i === 3 && (
                    <div className="mt-4">
                      <p className="text-sm text-[#5f5e5a] mb-3">테스트 발송 후 연결을 완료합니다.</p>
                      <button onClick={() => save(4, { connected: true })} disabled={saving} className="bg-[#085041] text-white font-medium text-sm rounded-lg px-4 py-2.5 cursor-pointer disabled:opacity-60">
                        {saving ? "연결 중..." : "연결 완료"}
                      </button>
                    </div>
                  )}

                  {done && <p className="mt-3 text-sm font-semibold text-[#085041]">✓ 완료</p>}
                </div>
              );
            })}
          </div>

          {msg && <p className="text-[#d32f2f] text-sm mt-3">{msg}</p>}

          {channel?.connected && (
            <div className="mt-4 bg-[#e1f5ee] border border-[#9fe1cb] rounded-xl px-5 py-4 text-center">
              <p className="font-bold text-[#085041]">🎉 발송 채널 연결 완료!</p>
              <p className="text-sm text-[#085041] mt-1">메시지 발송 기능을 사용할 수 있습니다.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
