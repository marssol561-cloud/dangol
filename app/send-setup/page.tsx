"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

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
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>메시지 발송 설정</h1>

      {/* Progress bar */}
      <div style={{ background: "#e5e7eb", borderRadius: 999, height: 8, marginBottom: 24 }}>
        <div style={{ background: "#2563eb", width: `${progressPct}%`, height: 8, borderRadius: 999, transition: "width .3s" }} />
      </div>

      {/* Step cards */}
      {STEPS.map((s, i) => {
        const done = step > i;
        const active = step === i;
        return (
          <div
            key={i}
            style={{
              border: `1px solid ${active ? "#2563eb" : done ? "#86efac" : "#e5e7eb"}`,
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              background: done ? "#f0fff4" : active ? "#eff6ff" : "#fafafa",
              opacity: !done && !active ? 0.5 : 1,
            }}
          >
            <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{`Step ${i + 1}: ${s.label}`}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{s.desc}</p>

            {active && i === 0 && (
              <div style={{ marginTop: 12 }}>
                <input
                  value={kakaoId}
                  onChange={(e) => setKakaoId(e.target.value)}
                  placeholder="pfXXXXXXXXXXXXXXXX"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
                />
                <button
                  onClick={() => save(1, { kakao_channel_id: kakaoId })}
                  disabled={saving}
                  style={btnStyle}
                >
                  {saving ? "저장 중..." : "저장 후 다음"}
                </button>
                <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>* 알림톡 미연결 시 SMS/이메일로 자동 전환됩니다.</p>
              </div>
            )}

            {active && i === 1 && (
              <div style={{ marginTop: 12 }}>
                <input
                  value={senderNum}
                  onChange={(e) => setSenderNum(e.target.value)}
                  placeholder="01012345678"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
                />
                <button
                  onClick={() => save(2, { sender_number: senderNum })}
                  disabled={saving}
                  style={btnStyle}
                >
                  {saving ? "저장 중..." : "저장 후 다음"}
                </button>
              </div>
            )}

            {active && i === 2 && (
              <div style={{ marginTop: 12 }}>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Solapi API Secret Key"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
                />
                <p style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>
                  * 키는 암호화 저장되며 이후 조회되지 않습니다.
                </p>
                <button
                  onClick={() => save(3, { api_key: apiKey })}
                  disabled={saving || !apiKey}
                  style={btnStyle}
                >
                  {saving ? "저장 중..." : "저장 후 다음"}
                </button>
              </div>
            )}

            {active && i === 3 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 14, marginBottom: 12 }}>테스트 발송 후 연결을 완료합니다.</p>
                <button
                  onClick={() => save(4, { connected: true })}
                  disabled={saving}
                  style={{ ...btnStyle, background: "#16a34a" }}
                >
                  {saving ? "연결 중..." : "연결 완료"}
                </button>
              </div>
            )}

            {done && <p style={{ marginTop: 8, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ 완료</p>}
          </div>
        );
      })}

      {msg && <p style={{ color: "#c00", fontSize: 14 }}>{msg}</p>}

      {channel?.connected && (
        <div style={{ padding: 16, background: "#f0fff4", borderRadius: 10, border: "1px solid #86efac", textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 700, color: "#16a34a" }}>🎉 발송 채널 연결 완료!</p>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>메시지 발송 기능을 사용할 수 있습니다.</p>
        </div>
      )}
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  marginTop: 10,
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
