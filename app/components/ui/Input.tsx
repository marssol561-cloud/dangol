import { type InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`bg-white border border-[#e5e5e0] rounded-[8px] p-[12px] w-full text-[14px] text-[#2c2c2a] placeholder-[#888780] outline-none focus:border-[#0f6e56] transition-colors ${className}`}
      {...props}
    />
  );
}
