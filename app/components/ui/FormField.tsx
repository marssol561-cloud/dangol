interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

export default function FormField({ label, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-[6px] w-full">
      <span className="text-[12px] font-medium text-[#5f5e5a]">{label}</span>
      {children}
    </div>
  );
}
