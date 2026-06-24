import type { ButtonHTMLAttributes, CSSProperties } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  style?: CSSProperties;
}

const btnBase: CSSProperties = {
  width: '100%',
  background: '#0f6e56',
  color: '#fff',
  fontWeight: 600,
  fontSize: 15,
  borderRadius: 8,
  padding: '14px 20px',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
};

export default function PrimaryButton({ className = '', children, style, ...props }: PrimaryButtonProps) {
  return (
    <button
      style={{ ...btnBase, ...style }}
      className={`disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
