interface DayDividerProps {
  label: string;
}

// Hairline + bold uppercase label (JOS-21) — chosen over a colored
// background band, which was tried and rejected as too visually
// competitive with the entry cards themselves.
//
// Sage for both the label and the rule, on both "Today" and "Yesterday" —
// originally only "Today" was sage and "Yesterday" was muted ink-soft, but
// that let the boundary disappear while scrolling quickly; both variants
// carry equal weight now, with the label text itself (not color) doing the
// job of telling them apart. Extra margin-top on top of the list's own
// gap, so a divider reads as a deliberate break rather than blending into
// the regular card-to-card rhythm.
export function DayDivider({ label }: DayDividerProps) {
  return (
    <div className="mt-[22px] flex items-center gap-2.5">
      <span className="text-[14px] font-extrabold tracking-[0.03em] whitespace-nowrap text-sage uppercase">
        {label}
      </span>
      <span className="h-[1.5px] flex-1 bg-sage/55" aria-hidden="true" />
    </div>
  );
}
