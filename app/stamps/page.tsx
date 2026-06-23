"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import FormField from "@/app/components/ui/FormField";
import Input from "@/app/components/ui/Input";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

interface StampsPolicy {
  required_count: number;
  reward_desc: string | null;
  service_a: string | null;
  service_b: string | null;
  service_c: string | null;
}

const DEFAULT: StampsPolicy = {
  required_count: 10,
  reward_desc: null,
  service_a: null,
  service_b: null,
  service_c: null,
};


export default function StampsPage() {
  const [policy, setPolicy] = useState<StampsPolicy>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stamps-rewards")
      .then((r) => r.json())
      .then((d) => {
        if (d.required_count !== undefined) setPolicy(d);
      })
      .catch(() => setError("불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/stamps-rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "저장 실패");
        return;
      }
      setSaved(true);
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="스탬프·쿠폰" />

      <main className="flex-1 p-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-[#888780] text-sm">← 홈</Link>
          <h1 className="text-2xl font-semibold text-[#2c2c2a]">스탬프·쿠폰 설정</h1>
        </div>

        {loading ? (
          <p className="text-sm text-[#888780]">불러오는 중...</p>
        ) : (
          <div className="max-w-[560px]">
            <form onSubmit={handleSave} className="bg-white border border-[#e5e5e0] rounded-[12px] p-[24px] flex flex-col gap-[16px]">
              <FormField label="리워드 기준 스탬프 수">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={policy.required_count}
                  onChange={(e) => setPolicy({ ...policy, required_count: Number(e.target.value) })}
                  required
                />
              </FormField>

              <FormField label="리워드 설명">
                <Input
                  type="text"
                  placeholder="예: 아메리카노 1잔 무료"
                  value={policy.reward_desc ?? ""}
                  onChange={(e) => setPolicy({ ...policy, reward_desc: e.target.value || null })}
                />
              </FormField>

              <FormField label="첫 방문 쿠폰 혜택 (A)">
                <Input
                  type="text"
                  placeholder="예: 첫 방문 10% 할인"
                  value={policy.service_a ?? ""}
                  onChange={(e) => setPolicy({ ...policy, service_a: e.target.value || null })}
                />
              </FormField>

              <FormField label="재방문 쿠폰 혜택 (B)">
                <Input
                  type="text"
                  placeholder="예: 재방문 음료 1+1"
                  value={policy.service_b ?? ""}
                  onChange={(e) => setPolicy({ ...policy, service_b: e.target.value || null })}
                />
              </FormField>

              <FormField label="친구 추천 쿠폰 혜택 (C)">
                <Input
                  type="text"
                  placeholder="예: 친구 추천 500원 할인"
                  value={policy.service_c ?? ""}
                  onChange={(e) => setPolicy({ ...policy, service_c: e.target.value || null })}
                />
              </FormField>

              {error && <p className="text-[#d32f2f] text-xs">{error}</p>}
              {saved && (
                <div className="bg-[#e1f5ee] border border-[#9fe1cb] rounded-[12px] px-4 py-3">
                  <p className="text-sm font-semibold text-[#085041]">✓ 저장되었습니다.</p>
                </div>
              )}

              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </PrimaryButton>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
