import Link from "next/link";

const ownerNavItems = [
  { href: "/", label: "대시보드" },
  { href: "/customers", label: "고객" },
  { href: "/events", label: "이벤트" },
  { href: "/stamps", label: "스탬프·쿠폰" },
  { href: "/messages", label: "소식 보내기" },
  { href: "/settings", label: "설정" },
];

const adminNavItems = [
  { href: "/admin", label: "통합 대시보드" },
  { href: "/admin/stores", label: "매장" },
  { href: "/admin/customers", label: "통합 고객" },
  { href: "/admin/messages", label: "발송·비용" },
  { href: "/admin/consents", label: "동의·법무" },
  { href: "/admin/system", label: "시스템" },
  { href: "/admin/channels", label: "채널 연결" },
];

interface AuthHeaderProps {
  variant: "auth";
}

interface OwnerHeaderProps {
  variant: "owner";
  activeItem?: string;
}

interface AdminHeaderProps {
  variant: "admin";
  activeItem?: string;
}

interface CustomerHeaderProps {
  variant: "customer";
  storeName: string;
  subtitle: string;
}

type AppHeaderProps = AuthHeaderProps | OwnerHeaderProps | AdminHeaderProps | CustomerHeaderProps;

export default function AppHeader(props: AppHeaderProps) {
  if (props.variant === "auth") {
    return (
      <header style={{ background: '#0f6e56', height: 64, display: 'flex', alignItems: 'center', paddingLeft: 32, flexShrink: 0 }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>리붐단골</span>
      </header>
    );
  }

  if (props.variant === "customer") {
    return (
      <header className="bg-[#0f6e56] px-5 py-5 shrink-0">
        <p className="font-bold text-base text-white leading-tight">{props.storeName}</p>
        <p className="text-xs text-[#e1f5ee] mt-0.5">{props.subtitle}</p>
      </header>
    );
  }

  if (props.variant === "admin") {
    return (
      <header className="bg-[#04342c] h-16 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-white">리붐단골</span>
          <span className="text-xs font-medium text-[#9fe1cb]">관리자</span>
        </div>
        <nav className="flex items-center gap-5">
          {adminNavItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-[13px] text-white ${props.activeItem === label ? "font-semibold" : "font-normal"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
    );
  }

  return (
    <header className="bg-[#0f6e56] h-16 flex items-center px-8 shrink-0">
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
        <span className="font-bold text-lg text-white">리붐단골</span>
        <nav className="flex items-center gap-6">
          {ownerNavItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm text-white ${props.activeItem === label ? "font-semibold" : "font-normal"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
