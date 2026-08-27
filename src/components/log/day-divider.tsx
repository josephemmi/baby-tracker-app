interface DayDividerProps {
  label: string;
  today?: boolean;
}

// Hairline + bold uppercase label (JOS-21) — chosen over a colored
// background band, which was tried and rejected as too visually
// competitive with the entry cards themselves.
export function DayDivider({ label, today = false }: DayDividerProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-[11.5px] font-bold tracking-[0.05em] whitespace-nowrap uppercase ${
          today ? "text-sage" : "text-ink-soft"
        }`}
      >
        {label}
      </span>
      <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
    </div>
  );
}
