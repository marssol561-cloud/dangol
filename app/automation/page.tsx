"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AppHeader from "@/app/components/AppHeader";

type RuleType = "churn" | "anniversary";
type TemplateId = "churn_reengage" | "anniversary";

interface AutoRule {
  id?: string;
  type: RuleType;
  enabled: boolean;
  params: { churn_days?: number } | null;
  template_id: TemplateId | null;
}

const DEFAULTS: Record<RuleType, AutoRule> = {
  churn: { type: "churn", enabled: false, params: { churn_days: 60 }, template_id: "churn_reengage" },
  anniversary: { type: "anniversary", enabled: false, params: null, template_id: "anniversary" },
};

export default function AutomationPage() {
  const [storeLinkId, setStoreLinkId] = useState("");
  const [rules, setRules] = useState<Record<RuleType, AutoRule>>({ ...DEFAULTS });
  const [saving, setSaving] = useState<RuleType | null>(null);
  const [status, setStatus] = useState<Record<RuleType, string | null>>({ churn: null, anniversary: null });

  const db = createBrowserClient(
    process.env.NEXT_PUBLIC_DANGOL_DB_URL!,
    process.env.NEXT_PUBLIC_DANGOL_DB_ANON_KEY!
  );

  useEffect(() => {
    db.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: link } = await db.from("store_links").select("id").eq("owner_id", session.user.id).limit(1).single();
      if (!link) return;
      setStoreLinkId(link.id);

      const resp = await fetch(`/api/automation?store_link_id=${link.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.ok) {
        const json = await resp.json() as { rules: AutoRule[] };
        const loaded: Record<RuleType, AutoRule> = { ...DEFAULTS };
        for (const r of json.rules) loaded[r.type] = r;
        setRules(loaded);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRule(type: RuleType) {
    if (!storeLinkId) return;
    setSaving(type);
    setStatus((s) => ({ ...s, [type]: null }));

    const { data: { session } } = await db.auth.getSession();
    if (!session) { setSaving(null); return; }

    const rule = rules[type];
    const resp = await fetch("/api/automation", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        store_link_id: storeLinkId,
        type: rule.type,
        enabled: rule.enabled,
        params: rule.params,
        template_id: rule.template_id,
      }),
    });

    const json = await resp.json();
    setStatus((s) => ({ ...s, [type]: resp.ok ? "저장됨" : (json.error ?? "오류") }));
    setSaving(null);
  }

  function updateRule(type: RuleType, patch: Partial<AutoRule>) {
    setRules((r) => ({ ...r, [type]: { ...r[type], ...patch } }));
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="소식 보내기" />

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold text-[#2c2c2a] mb-6">자동화 메시지</h1>

        <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Churn rule */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24 }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-semibold text-[#2c2c2a]">장기 미방문 고객 재유입</p>
                <p className="text-sm text-[#888780] mt-0.5">N일 이상 방문 없는 고객에게 자동 발송</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.churn.enabled}
                  onChange={(e) => updateRule("churn", { enabled: e.target.checked })}
                  className="accent-[#0f6e56]"
                />
                <span className="text-sm text-[#5f5e5a]">{rules.churn.enabled ? "ON" : "OFF"}</span>
              </label>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-[#5f5e5a]">미방문 기준</label>
              <input
                type="number"
                min={7}
                max={365}
                value={rules.churn.params?.churn_days ?? 60}
                onChange={(e) => updateRule("churn", { params: { churn_days: Number(e.target.value) } })}
                className="w-20 bg-white border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm text-[#2c2c2a] outline-none focus:border-[#0f6e56]"
              />
              <span className="text-sm text-[#5f5e5a]">일</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => saveRule("churn")}
                disabled={saving === "churn"}
                className="bg-[#0f6e56] text-white font-medium text-sm rounded-lg px-4 py-2 cursor-pointer disabled:opacity-60"
              >
                {saving === "churn" ? "저장 중..." : "저장"}
              </button>
              {status.churn && <span className="text-sm text-[#085041]">{status.churn}</span>}
            </div>
          </div>

          {/* Anniversary rule */}
          <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 12, padding: 24 }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-semibold text-[#2c2c2a]">기념일 메시지</p>
                <p className="text-sm text-[#888780] mt-0.5">생일 등 기념일에 자동 발송 (준비 중)</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.anniversary.enabled}
                  onChange={(e) => updateRule("anniversary", { enabled: e.target.checked })}
                  className="accent-[#0f6e56]"
                />
                <span className="text-sm text-[#5f5e5a]">{rules.anniversary.enabled ? "ON" : "OFF"}</span>
              </label>
            </div>
            <p className="text-xs text-[#888780] mb-4">* 생일 정보 수집 기능은 추후 제공됩니다.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => saveRule("anniversary")}
                disabled={saving === "anniversary"}
                className="bg-[#0f6e56] text-white font-medium text-sm rounded-lg px-4 py-2 cursor-pointer disabled:opacity-60"
              >
                {saving === "anniversary" ? "저장 중..." : "저장"}
              </button>
              {status.anniversary && <span className="text-sm text-[#085041]">{status.anniversary}</span>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
