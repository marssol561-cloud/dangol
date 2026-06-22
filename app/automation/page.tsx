"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

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
    <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>자동화 메시지</h1>

      {/* Churn rule */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>장기 미방문 고객 재유입</p>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>N일 이상 방문 없는 고객에게 자동 발송</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rules.churn.enabled}
              onChange={(e) => updateRule("churn", { enabled: e.target.checked })}
            />
            <span style={{ fontSize: 14 }}>{rules.churn.enabled ? "ON" : "OFF"}</span>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 14 }}>미방문 기준</label>
          <input
            type="number"
            min={7}
            max={365}
            value={rules.churn.params?.churn_days ?? 60}
            onChange={(e) => updateRule("churn", { params: { churn_days: Number(e.target.value) } })}
            style={{ width: 70, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
          />
          <span style={{ fontSize: 14 }}>일</span>
        </div>
        <button
          onClick={() => saveRule("churn")}
          disabled={saving === "churn"}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
        >
          {saving === "churn" ? "저장 중..." : "저장"}
        </button>
        {status.churn && <span style={{ marginLeft: 12, fontSize: 13, color: "#16a34a" }}>{status.churn}</span>}
      </section>

      {/* Anniversary rule */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>기념일 메시지</p>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>생일 등 기념일에 자동 발송 (준비 중)</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rules.anniversary.enabled}
              onChange={(e) => updateRule("anniversary", { enabled: e.target.checked })}
            />
            <span style={{ fontSize: 14 }}>{rules.anniversary.enabled ? "ON" : "OFF"}</span>
          </label>
        </div>
        <p style={{ fontSize: 13, color: "#999", margin: "0 0 12px" }}>* 생일 정보 수집 기능은 추후 제공됩니다.</p>
        <button
          onClick={() => saveRule("anniversary")}
          disabled={saving === "anniversary"}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
        >
          {saving === "anniversary" ? "저장 중..." : "저장"}
        </button>
        {status.anniversary && <span style={{ marginLeft: 12, fontSize: 13, color: "#16a34a" }}>{status.anniversary}</span>}
      </section>
    </main>
  );
}
