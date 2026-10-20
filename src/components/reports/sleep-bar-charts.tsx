"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CARD, Legend, LegendItem, Readout, SECTION_TITLE } from "@/components/reports/sleep-report-parts";
import type { Day } from "@/lib/sleep-reports";
import {
  defaultDayKey,
  dur,
  longestChart,
  stackedChart,
  xLabels,
  type AxisTick,
  type XLabel,
} from "@/lib/sleep-report-view";

// A bar per day is at least this wide (px) with a gap of 6 between, so many
// days scroll sideways instead of squeezing into slivers.
const BAR_SLOT = 34;

// Which bar is pinned for the readout: the one tapped, else the newest
// complete day. Remounting (the range changed) starts again from the newest.
function usePinned(days: Day[]): [string | null, (key: string) => void] {
  const [picked, setPicked] = useState<string | null>(null);
  const key = picked !== null && days.some((d) => d.key === picked) ? picked : defaultDayKey(days);
  return [key, setPicked];
}

function XAxisLabels({ labels, on }: { labels: XLabel[]; on: number }) {
  return (
    <div aria-hidden="true" className="mt-1.5 flex h-10 gap-1.5 text-[11px] tabular-nums text-ink-soft">
      {labels.map((l, i) => (
        <div
          key={i}
          className={`min-w-7 flex-1 text-center leading-[1.15] ${i === on ? "font-bold text-ink" : ""}`}
        >
          {l.weekday}
          <br />
          {l.date}
          <small className="block min-h-[13px] text-[11px]">{l.month}</small>
        </div>
      ))}
    </div>
  );
}

// The frame both charts share: a y axis, dashed lines at half and the top,
// and a plot that scrolls sideways and opens on the latest day.
function Plot({
  count,
  ticks,
  bars,
  below,
  belowLabel,
}: {
  count: number;
  ticks: AxisTick[];
  bars: ReactNode;
  // Rows under the bars that scroll with them (x labels, wake counts).
  below: ReactNode;
  // A label for the last row of `below`, kept in the y-axis gutter.
  belowLabel?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [count]);

  return (
    <div className="flex gap-1.5">
      <div className="flex-none">
        <div aria-hidden="true" className="relative h-36 w-[30px] text-[11px] tabular-nums text-ink-soft">
          {ticks.map((t) => (
            <span key={t.label} className="absolute right-0 translate-y-1/2" style={{ bottom: `${t.pct}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        {belowLabel && (
          <>
            <div className="mt-1.5 h-10" />
            <div className="mt-1.5 flex h-5 items-center text-[11px] text-ink-soft">{belowLabel}</div>
          </>
        )}
      </div>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative" style={{ minWidth: count * BAR_SLOT }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-36">
            <i className="absolute inset-x-0 bottom-0 border-t border-line-strong" />
            <i className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-line" />
            <i className="absolute inset-x-0 bottom-full border-t border-dashed border-line" />
          </div>
          <div className="relative flex h-36 items-end gap-1.5">{bars}</div>
          {below}
        </div>
      </div>
    </div>
  );
}

const BAR_BUTTON = "flex h-full min-w-7 flex-1 flex-col items-center justify-end";

// Sleep per day: the whole bar is the day's total, night solid underneath and
// naps hatched on top (told apart by pattern, not only by shade). Today, still
// in progress, is dashed and lighter. Tap a bar to pin its readout.
export function SleepPerDayChart({ days }: { days: Day[] }) {
  const chart = useMemo(() => stackedChart(days), [days]);
  const labels = useMemo(() => xLabels(days), [days]);
  const [key, pick] = usePinned(days);
  const pinned = chart.bars.find((b) => b.key === key);

  return (
    <section aria-labelledby="sleep-per-day-h" className={CARD} data-card="stacked">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sleep-per-day-h" className={SECTION_TITLE}>
          Sleep per day
        </h2>
        <span className="text-xs tabular-nums text-ink-soft">{dur(chart.maxMs)}</span>
      </div>
      <Legend>
        <LegendItem swatch="bg-night">Night</LegendItem>
        <LegendItem swatch="sleep-hatch">Naps</LegendItem>
        <span>Dashed = today so far</span>
      </Legend>
      <Readout text={pinned?.readout ?? ""} />
      <Plot
        count={days.length}
        ticks={chart.ticks}
        below={<XAxisLabels labels={labels} on={labels.length - 1} />}
        bars={chart.bars.map((b) => (
          <button
            key={b.key}
            type="button"
            data-bar={b.key}
            aria-pressed={b.key === key}
            aria-label={b.label}
            onClick={() => pick(b.key)}
            className={BAR_BUTTON}
          >
            <span
              className={`flex w-full max-w-6 flex-col overflow-hidden rounded-t-[4px] ${
                b.partial ? "sleep-bar-partial" : ""
              } ${b.key === key ? "sleep-bar-selected" : ""}`}
              style={{ height: `${b.pct}%` }}
            >
              <span className="sleep-hatch" style={{ flex: `${b.napMs} 1 0` }} />
              <span className="bg-night" style={{ flex: `${b.nightMs} 1 0` }} />
            </span>
          </button>
        ))}
      />
    </section>
  );
}

// Longest stretch & night wakes: one bar per night, how long the longest
// unbroken sleep in it was, and under each bar how many times he woke.
export function SleepLongestChart({ days }: { days: Day[] }) {
  const chart = useMemo(() => longestChart(days), [days]);
  const labels = useMemo(() => xLabels(days), [days]);
  const [key, pick] = usePinned(days);
  const pinned = chart.bars.find((b) => b.key === key);

  return (
    <section aria-labelledby="sleep-longest-h" className={CARD} data-card="longest">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sleep-longest-h" className={SECTION_TITLE}>
          Longest stretch &amp; night wakes
        </h2>
        <span className="text-xs tabular-nums text-ink-soft">{dur(chart.maxMs)}</span>
      </div>
      <Legend>
        <LegendItem swatch="bg-night">Longest unbroken sleep in the night</LegendItem>
      </Legend>
      <Readout text={pinned?.readout ?? ""} />
      <Plot
        count={days.length}
        ticks={chart.ticks}
        belowLabel="Wakes"
        below={
          <>
            <XAxisLabels labels={labels} on={labels.length - 1} />
            <div aria-hidden="true" className="mt-1.5 flex h-5 gap-1.5 text-xs font-bold tabular-nums">
              {chart.bars.map((b) => (
                <div key={b.key} className="min-w-7 flex-1 text-center">
                  {b.wakes}
                </div>
              ))}
            </div>
          </>
        }
        bars={chart.bars.map((b) => (
          <button
            key={b.key}
            type="button"
            data-bar={b.key}
            aria-pressed={b.key === key}
            aria-label={b.label}
            onClick={() => pick(b.key)}
            className={BAR_BUTTON}
          >
            {b.hasNight && (
              <span
                className={`flex w-full max-w-6 flex-col overflow-hidden rounded-t-[4px] bg-night ${
                  b.partial ? "sleep-bar-partial" : ""
                } ${b.key === key ? "sleep-bar-selected" : ""}`}
                style={{ height: `${b.pct}%` }}
              />
            )}
          </button>
        ))}
      />
    </section>
  );
}
