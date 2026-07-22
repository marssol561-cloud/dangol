"use client";
import { useEffect, useState, useCallback } from "react";

interface StaffRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

const inputCls = "w-full bg-white border border-[#e5e5e0] rounded-lg px-3 py-2.5 text-sm text-[#2c2c2a] outline-none focus:border-[#0f6e56]";

export default function StaffSection() {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data = await res.json();
      setStaffList(data.staff ?? []);
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state set after await, not a sync render hazard
  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const createStaff = async () => {
    setError("");
    if (!email || !password) { setError("이메일과 비밀번호를 입력하세요"); return; }
    setSubmitting(true);
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name || undefined }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? "생성 실패"); return; }
    setShowForm(false);
    setEmail(""); setPassword(""); setName("");
    fetchStaff();
  };

  return (
    <section className="bg-white border border-[#e5e5e0] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[#2c2c2a]">직원 계정</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm text-[#0f6e56] border border-[#9fe1cb] px-3 py-1 rounded-lg"
        >
          {showForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-2 mb-4">
          <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          <input type="text" placeholder="이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          {error && <p className="text-xs text-[#d32f2f]">{error}</p>}
          <button
            onClick={createStaff}
            disabled={submitting}
            className="bg-[#0f6e56] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "생성 중..." : "직원 계정 생성"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#888780]">불러오는 중...</p>
      ) : staffList.length === 0 ? (
        <p className="text-sm text-[#888780]">등록된 직원이 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staffList.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#2c2c2a] font-medium">{s.name ?? s.email}</p>
                <p className="text-xs text-[#888780]">{s.email}</p>
              </div>
              <span className="text-xs bg-[#f8f7f4] text-[#5f5e5a] px-2 py-0.5 rounded-full border border-[#e5e5e0]">직원</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
