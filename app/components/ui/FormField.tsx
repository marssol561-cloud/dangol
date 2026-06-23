interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

export default function FormField({ label, children }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#5f5e5a' }}>{label}</span>
      {children}
    </div>
  );
}
