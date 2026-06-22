import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import StaffSection from "./StaffSection";

export default async function SettingsPage() {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") redirect("/login");

  const db = getServerClient();
  const { data: sl } = await db
    .from("store_links")
    .select("store_name, address, store_code")
    .eq("id", ctx.storeLinkId)
    .single();

  const storeInfo = sl as { store_name: string | null; address: string | null; store_code: string } | null;

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <Link href="/" className="text-gray-400 text-sm">← 홈</Link>
        <h1 className="text-lg font-bold text-gray-900">설정</h1>
      </header>

      <div className="max-w-xl mx-auto px-4 pt-6 space-y-5">
        {/* Store info */}
        <section className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-700 mb-3">매장 정보</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-400">매장명</dt>
              <dd className="text-gray-800 font-medium">{storeInfo?.store_name ?? "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">주소</dt>
              <dd className="text-gray-800">{storeInfo?.address ?? "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">스토어 코드</dt>
              <dd className="font-mono text-teal-700 font-semibold">{storeInfo?.store_code ?? "-"}</dd>
            </div>
          </dl>
        </section>

        {/* QR download */}
        <section className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-700 mb-3">QR 코드</h2>
          <p className="text-sm text-gray-500 mb-4">출력해서 카운터에 붙여두세요</p>
          <a
            href="/api/qr"
            className="inline-block bg-teal-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium"
            download
          >
            QR PDF 다운로드
          </a>
        </section>

        {/* Staff accounts */}
        <StaffSection />

        {/* Consent text */}
        <section className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-700 mb-3">개인정보 동의 안내문</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            고객님의 개인정보(연락처)는 단골 서비스 제공 및 혜택 안내 목적으로 수집·이용됩니다.
            동의는 선택사항이며, 언제든지 철회하실 수 있습니다. 철회 시 해당 서비스 이용이 제한될 수 있습니다.
          </p>
        </section>

        {/* Operations manual */}
        <section className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-700 mb-3">운영 매뉴얼</h2>
          <p className="text-sm text-gray-400">리붐단골 사용 가이드 (준비 중)</p>
        </section>

        {/* Nav shortcuts */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/stamps", label: "스탬프 설정" },
            { href: "/send-setup", label: "발송 채널 설정" },
            { href: "/automation", label: "자동화 설정" },
            { href: "/messages", label: "소식 보내기" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="bg-white rounded-xl p-4 shadow-sm text-sm text-gray-700 text-center"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
