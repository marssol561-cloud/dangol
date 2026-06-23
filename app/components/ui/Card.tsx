interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white border border-[#e5e5e0] rounded-[12px] p-[24px] flex flex-col gap-[16px] w-[420px] shrink-0 ${className}`}
    >
      {children}
    </div>
  );
}
