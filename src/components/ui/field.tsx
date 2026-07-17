interface FieldProps {
  label: string;
  children: React.ReactNode;
}

// Eyebrow-style field label per the design spec's typography scale.
export function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
