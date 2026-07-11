import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";
import AppHeader from "@/app/components/AppHeader";
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
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      <AppHeader variant="owner" activeItem="설정" />

      <main className="flex-1 p-8">
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[#888780] text-sm">← 홈</Link>
            <h1 className="text-2xl font-semibold text-[#2c2c2a]">설정</h1>
          </div>

          {/* Store info */}
          <section style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:24 }}>
            <h2 className="text-base font-semibold text-[#2c2c2a] mb-4">매장 정보</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#888780]">매장명</dt>
                <dd className="text-[#2c2c2a] font-medium">{storeInfo?.store_name ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#888780]">주소</dt>
                <dd className="text-[#2c2c2a]">{storeInfo?.address ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#888780]">스토어 코드</dt>
                <dd className="font-mono text-[#085041] font-semibold">{storeInfo?.store_code ?? "-"}</dd>
              </div>
            </dl>
          </section>

          {/* QR download */}
          <section style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:24 }}>
            <h2 className="text-base font-semibold text-[#2c2c2a] mb-2">QR 코드</h2>
            <p className="text-sm text-[#888780] mb-4">출력해서 카운터에 붙여두세요</p>
            <a
              href="/api/qr"
              className="inline-block bg-[#0f6e56] text-white px-5 py-2.5 rounded-lg text-sm font-medium"
              download
            >
              QR PDF 다운로드
            </a>
          </section>

          {/* Staff accounts */}
          <StaffSection />

          {/* Consent text */}
          <section style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:24 }}>
            <h2 className="text-base font-semibold text-[#2c2c2a] mb-3">개인정보 동의 안내문</h2>
            <p className="text-sm text-[#5f5e5a] leading-relaxed">
              고객님의 개인정보(연락처)는 단골 서비스 제공 및 혜택 안내 목적으로 수집·이용됩니다.
              동의는 선택사항이며, 언제든지 철회하실 수 있습니다. 철회 시 해당 서비스 이용이 제한될 수 있습니다.
            </p>
          </section>

          {/* Operations manual */}
          <section style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:24 }}>
            <h2 className="text-base font-semibold text-[#2c2c2a] mb-2">운영 매뉴얼</h2>
            <p className="text-sm text-[#888780]">리붐단골 사용 가이드 (준비 중)</p>
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
                style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:16 }} className="text-sm text-[#2c2c2a] text-center block"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
