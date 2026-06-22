"use client";
import { useEffect, useState, useCallback } from "react";

interface StaffRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

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
    <section className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-700">직원 계정</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm text-teal-600 border border-teal-200 px-3 py-1 rounded-lg"
        >
          {showForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 mb-4">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          <input
            type="text"
            placeholder="이름 (선택)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={createStaff}
            disabled={submitting}
            className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "생성 중..." : "직원 계정 생성"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : staffList.length === 0 ? (
        <p className="text-sm text-gray-400">등록된 직원이 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {staffList.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="text-gray-700 font-medium">{s.name ?? s.email}</p>
                <p className="text-xs text-gray-400">{s.email}</p>
              </div>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">직원</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
