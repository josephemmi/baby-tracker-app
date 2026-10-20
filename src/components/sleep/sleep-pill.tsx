import type { PillModel, PillVariant } from "@/lib/sleep-report-view";

// One status pill with two homes: inside the Last sleep tile on Log, and at the
// top of the Today card on Reports (JOS-83). Full width of its card, 36 px
// tall, fully rounded; the dot sits on the left edge and the words are centred
// in the pill, not centred together with the dot. The dot pulses only while a
// sleep is running (and not when the device asks for less motion, see
// .sleep-dot-live in globals.css).
const LOOK: Record<PillVariant, { box: string; dot: string }> = {
  asleep: { box: "bg-night text-white", dot: "bg-white sleep-dot-live" },
  paused: { box: "border border-line-strong bg-paper text-ink", dot: "bg-night" },
  awake: { box: "bg-sage-soft text-ink", dot: "bg-sage" },
  none: { box: "border border-line bg-paper text-ink-soft", dot: "bg-line-strong" },
};

interface SleepPillProps {
  pill: PillModel;
  // Reports: a live region, so a change of state is announced. The Log pill is
  // not (it changes every minute); it carries an aria-label instead.
  live?: boolean;
  className?: string;
}

export function SleepPill({ pill, live = false, className = "" }: SleepPillProps) {
  const look = LOOK[pill.variant];
  return (
    <div
      role={live ? "status" : pill.label ? "img" : undefined}
      aria-label={pill.label}
      data-sleep-pill={pill.variant}
      className={`relative flex min-h-9 items-center justify-center rounded-full px-[34px] py-1.5 text-center text-[15px] leading-tight font-bold tabular-nums ${look.box} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1/2 left-[15px] -mt-[4.5px] h-[9px] w-[9px] rounded-full ${look.dot}`}
      />
      <span>{pill.text}</span>
    </div>
  );
}
