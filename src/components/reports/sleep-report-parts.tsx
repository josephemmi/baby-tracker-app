import type { ReactNode } from "react";

// Small pieces the Sleep tab's cards share (JOS-83). The look is the app's own
// card (see StatCard and the Feeds charts), plus the sleep colours.

export const CARD = "min-w-0 rounded-[10px] border border-line bg-paper-raised p-4 shadow-card";
export const EYEBROW = "text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase";
// The title of a section on the Sleep tab (JOS-91): the screen titles' bold and
// tracking (the household name, Recently Deleted are 19 px) one step smaller,
// in ink rather than the grey small capitals of the labels inside a card, so
// each section starts with a clear break. One place, so the size is one edit.
export const SECTION_TITLE = "text-[17px] leading-snug font-bold tracking-[-0.01em] text-ink";

// The box above a chart that says what the pinned bar or row is. Polite, so a
// screen reader reads it when a new bar is chosen.
export function Readout({ text }: { text: string }) {
  return (
    <div
      aria-live="polite"
      className="mt-1.5 mb-2.5 min-h-10 rounded-lg bg-night-soft px-2.5 py-2 text-[12.5px] font-semibold tabular-nums text-night"
    >
      {text}
    </div>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 mb-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink-soft">
      {children}
    </div>
  );
}

export function LegendItem({ swatch, children }: { swatch?: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch && <i aria-hidden="true" className={`inline-block h-3 w-3 rounded-[3px] ${swatch}`} />}
      {children}
    </span>
  );
}

const AXIS = [
  ["12 am", 0],
  ["6 am", 25],
  ["12 pm", 50],
  ["6 pm", 75],
  ["12 am", 100],
] as const;

// 12 am, 6 am, 12 pm, 6 pm, 12 am under (or over) a row that is a whole day.
export function TimeAxis({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`relative h-4 text-[11px] text-ink-soft tabular-nums ${className}`}>
      {AXIS.map(([label, pct], i) => (
        <span
          key={i}
          className={`absolute top-0 whitespace-nowrap ${
            i === 0 ? "" : i === AXIS.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
          }`}
          style={{ left: `${pct}%` }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
