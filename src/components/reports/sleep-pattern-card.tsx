"use client";

import { useMemo, useState } from "react";
import { CARD, EYEBROW, Legend, LegendItem, Readout, TimeAxis } from "@/components/reports/sleep-report-parts";
import type { Day } from "@/lib/sleep-reports";
import { defaultDayKey, patternRows } from "@/lib/sleep-report-view";

// The 24-hour pattern (JOS-83): one row per calendar day, the latest 14, newest
// first, 12 am to 12 am. A night is drawn on two rows (the evening on one, the
// morning on the next) but counts once, on the day he woke. This is the one
// place a sleep is cut, and only for drawing. Tap a row to pin its readout.
export function SleepPatternCard({ days }: { days: Day[] }) {
  const rows = useMemo(() => patternRows(days), [days]);
  const [picked, setPicked] = useState<string | null>(null);
  const fallback = defaultDayKey(days);
  const key = picked !== null && rows.some((r) => r.key === picked) ? picked : fallback;
  const pinned = rows.find((r) => r.key === key) ?? rows[0];

  return (
    <section aria-labelledby="sleep-pattern-h" className={CARD} data-card="pattern">
      <h3 id="sleep-pattern-h" className={EYEBROW}>
        24-hour pattern
      </h3>
      <Legend>
        <LegendItem swatch="bg-night">Asleep</LegendItem>
      </Legend>
      <p className="mb-0.5 text-xs text-ink-soft">
        One row per calendar day. A night shows on two rows but counts on the day he woke.
      </p>
      <Readout text={pinned?.readout ?? ""} />
      <TimeAxis className="ml-[52px]" />
      <div role="group" aria-label="Days, newest first. Tap a day for its details.">
        {rows.map((r) => {
          const on = r.key === key;
          return (
            <button
              key={r.key}
              type="button"
              data-row={r.key}
              aria-pressed={on}
              aria-label={r.readout}
              onClick={() => setPicked(r.key)}
              className="flex w-full items-center gap-1.5 py-[3px] text-left"
            >
              <span
                className={`w-[46px] flex-none text-[11.5px] tabular-nums ${
                  on ? "font-bold text-ink" : "text-ink-soft"
                }`}
              >
                {r.label}
              </span>
              <span
                className={`relative h-5 flex-1 rounded-[4px] border bg-night/[0.04] ${
                  on ? "border-ink" : "border-line"
                }`}
              >
                {r.pieces.map((p, i) => (
                  <i
                    key={i}
                    className={`absolute top-0.5 bottom-0.5 min-w-[2px] rounded-[3px] ${
                      p.running ? "sleep-run-hatch" : "bg-night"
                    } ${r.partial ? "opacity-70" : ""}`}
                    style={{ left: `${p.left}%`, width: `${p.width}%` }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {days.length > 14 && <p className="mt-2 text-xs text-ink-soft">Showing the latest 14 days.</p>}
    </section>
  );
}
