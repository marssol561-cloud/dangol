import type { CSSProperties } from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

const cardBase: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#fff',
  border: '1px solid #e5e5e0',
  borderRadius: 12,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxSizing: 'border-box',
};

export default function Card({ children, className = '', style }: CardProps) {
  return (
    <div style={{ ...cardBase, ...style }} className={className}>
      {children}
    </div>
  );
}
