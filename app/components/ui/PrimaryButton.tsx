import { type ButtonHTMLAttributes } from 'react';

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export default function PrimaryButton({ className = '', children, ...props }: PrimaryButtonProps) {
  return (
    <button
      className={`bg-[#0f6e56] rounded-[8px] py-[14px] px-[20px] w-full text-[15px] font-semibold text-white flex items-center justify-center cursor-pointer disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
