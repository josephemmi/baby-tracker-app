"use client";

import { useMemo } from "react";
import { useServerNow } from "@/components/log/use-server-now";
import { SleepPill } from "@/components/sleep/sleep-pill";
import { CARD, EYEBROW, TimeAxis } from "@/components/reports/sleep-report-parts";
import type { Sleep } from "@/lib/sleep";
import { toReportSleeps, today } from "@/lib/sleep-reports";
import {
  dur,
  recentForToday,
  todayCaption,
  todayPill,
  todayRows,
  todayStrip,
  type TodayRow,
} from "@/lib/sleep-report-view";

const ROW_TONE: Record<TodayRow["tone"], { label: string; duration: string }> = {
  muted: { label: "text-ink-soft", duration: "font-normal text-ink-soft" },
  normal: { label: "text-ink-soft", duration: "font-bold text-night" },
  now: { label: "font-bold text-night", duration: "font-normal text-ink-soft" },
};

// The card at the top of the Sleep tab (JOS-83): the status pill, the naps so
// far today, the day strip and one row per sleep. It ignores the range pills
// and nothing on it repeats the rows ("3 naps", "usually 4h by now" and "with
// last night" were taken out on purpose). A sleep still open is in no total.
export function SleepTodayCard({ sleeps }: { sleeps: Sleep[] }) {
  // Redrawn each second while a sleep is open so the pill agrees with the
  // Log's timer; otherwise every 30 s.
  const now = useServerNow(sleeps.some((s) => s.closedAt == null) ? 1000 : 30_000);
  const td = useMemo(
    () => today(toReportSleeps(recentForToday(sleeps, now), now), now),
    [sleeps, now],
  );
  const pill = todayPill(td);
  const caption = todayCaption(td);
  const strip = todayStrip(td);
  const rows = todayRows(td);

  return (
    <section aria-label="Sleep now and naps today" className={CARD} data-card="today">
      <SleepPill pill={pill} live />
      {pill.caption && (
        <p data-pill-caption className="mt-1.5 text-center text-xs text-ink-soft">
          {pill.caption}
        </p>
      )}

      <p className={`mt-4 ${EYEBROW}`}>Naps today</p>
      <p data-naps className="mt-1.5 mb-0.5 text-[34px] leading-[1.1] font-bold tabular-nums text-night">
        {dur(td.primaryMs)}
      </p>
      {caption && (
        <p data-naps-caption className="text-xs text-ink-soft">
          {caption}
        </p>
      )}

      <div
        role="img"
        aria-label={strip.description}
        className="relative mt-3 h-[22px] overflow-hidden rounded-[4px] border border-line bg-night/5"
      >
        {strip.pieces.map((p, i) => (
          <i
            key={i}
            className={`absolute top-0.5 bottom-0.5 min-w-[2px] rounded-[3px] ${
              p.running ? "sleep-run-hatch" : "bg-night"
            }`}
            style={{ left: `${p.left}%`, width: `${p.width}%` }}
          />
        ))}
        {/* The rest of the day has not happened yet. */}
        <i
          aria-hidden="true"
          className="absolute inset-y-0 right-0 bg-paper-raised opacity-80"
          style={{ left: `${strip.nowPct}%` }}
        />
        <i
          aria-hidden="true"
          className="absolute inset-y-0 -ml-px w-0.5 bg-ink"
          style={{ left: `${strip.nowPct}%` }}
        />
      </div>
      <TimeAxis className="mt-1" />

      {rows.length > 0 && (
        <ul aria-label="Each sleep" className="mt-3">
          {rows.map((r) => (
            <li
              key={r.label}
              data-row
              className="grid grid-cols-[66px_1fr_auto] items-baseline gap-2 border-t border-line py-[7px] text-[13.5px] tabular-nums max-[340px]:gap-1.5 max-[340px]:text-[12.5px]"
            >
              <span className={`whitespace-nowrap ${ROW_TONE[r.tone].label}`}>{r.label}</span>
              <span className="whitespace-nowrap">{r.range}</span>
              <span className={`text-right whitespace-nowrap ${ROW_TONE[r.tone].duration}`}>
                {r.duration}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
