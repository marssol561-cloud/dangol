import type { InputHTMLAttributes, CSSProperties } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  style?: CSSProperties;
}

const inputBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
  borderRadius: 8,
  padding: 12,
  fontSize: 14,
  color: '#2c2c2a',
  outline: 'none',
};

export default function Input({ className = '', style, ...props }: InputProps) {
  return (
    <input
      style={{ ...inputBase, ...style }}
      className={`border border-[#e5e5e0] focus:border-[#0f6e56] transition-colors placeholder-[#888780] ${className}`}
      {...props}
    />
  );
}
