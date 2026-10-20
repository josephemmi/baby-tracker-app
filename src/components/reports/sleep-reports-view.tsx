"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useServerNow } from "@/components/log/use-server-now";
import { CARD } from "@/components/reports/sleep-report-parts";
import { SleepLongestChart, SleepPerDayChart } from "@/components/reports/sleep-bar-charts";
import { SleepPatternCard } from "@/components/reports/sleep-pattern-card";
import { SleepStatCards } from "@/components/reports/sleep-stat-cards";
import { SleepTable } from "@/components/reports/sleep-table";
import { SleepTodayCard } from "@/components/reports/sleep-today-card";
import { useSleepReport } from "@/components/reports/use-sleep-report";
import { currentMonthValue, type ReportRange } from "@/lib/reports";
import { computeDays, dayKey, summarise, toReportSleeps } from "@/lib/sleep-reports";
import { fetchFromMs, filterDaysByRange, sleepYears } from "@/lib/sleep-report-view";

type RangeKind = ReportRange["kind"];

const RANGE_OPTIONS: { value: RangeKind; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "all", label: "All time" },
];

const FIELD =
  "rounded-[10px] border border-line-strong bg-paper-raised px-3 py-1.5 text-base text-ink tabular-nums focus:border-sage focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-sage";

// Reports > Sleep (JOS-83): a Today card, the date range, the 24-hour pattern,
// the averages, two charts and a daily table. A sleep belongs to the date he
// woke, the longest sleep that ended on a date is its night and the rest are
// naps; a sleep still open is in no total; today is shown but never averaged
// (see sleep-reports.ts). Nothing here writes to the database.
export function SleepReportsView({ babyId }: { babyId: string }) {
  const now = useServerNow(30_000);
  const todayKey = dayKey(now);

  const [rangeKind, setRangeKind] = useState<RangeKind>("7d");
  const [month, setMonth] = useState(() => currentMonthValue(new Date()));
  const [yearPick, setYearPick] = useState<number | null>(null);

  // Only the 7 and 30 day ranges read less than everything, so what is read
  // depends on the kind of range alone, not on which month or year is picked.
  const { sleeps, ready, covered, failed } = useSleepReport(babyId, fetchFromMs(rangeKind, todayKey));

  const reportSleeps = useMemo(() => toReportSleeps(sleeps, now), [sleeps, now]);
  const allDays = useMemo(() => computeDays(reportSleeps, now), [reportSleeps, now]);
  // The Yearly picker offers the years that have sleep in them.
  const years = useMemo(() => sleepYears(allDays), [allDays]);
  const [fallbackYear] = useState(() => new Date().getFullYear());
  const year = yearPick ?? years[0] ?? fallbackYear;
  const range = useMemo<ReportRange>(() => {
    if (rangeKind === "month") return { kind: "month", month };
    if (rangeKind === "year") return { kind: "year", year };
    return { kind: rangeKind };
  }, [rangeKind, month, year]);
  const days = useMemo(() => filterDaysByRange(allDays, range, todayKey), [allDays, range, todayKey]);
  const summary = useMemo(() => summarise(days), [days]);

  // With three weeks of pills to pick from on a narrow phone, keep the chosen
  // one in view.
  const pills = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pills.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [rangeKind]);

  // Changing the range starts the charts afresh: pinned on the newest day,
  // scrolled to the latest.
  const rangeId = `${range.kind}:${"month" in range ? range.month : "year" in range ? range.year : ""}`;

  return (
    <div className="flex flex-col gap-5">
      {ready ? (
        <SleepTodayCard sleeps={sleeps} />
      ) : (
        <p className={`${CARD} text-sm text-ink-soft`} role="status">
          {failed ? "Couldn’t load sleeps. Check your connection and try again." : "Loading sleeps…"}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div
          ref={pills}
          role="group"
          aria-label="Date range"
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {RANGE_OPTIONS.map((option) => {
            const on = rangeKind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => setRangeKind(option.value)}
                className={`min-h-[34px] flex-none rounded-full border px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors ${
                  on
                    ? "border-ink bg-ink text-paper-raised"
                    : "border-line-strong text-ink-soft hover:bg-paper-raised"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {rangeKind === "month" && (
          <div>
            <input
              type="month"
              aria-label="Month"
              value={month}
              onChange={(e) => setMonth(e.target.value || month)}
              className={FIELD}
            />
          </div>
        )}

        {rangeKind === "year" && (
          <div>
            <select
              aria-label="Year"
              value={year}
              onChange={(e) => setYearPick(Number(e.target.value))}
              className={FIELD}
            >
              {(years.length ? years : [year]).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {ready && !covered ? (
        <p className="text-sm text-ink-soft" role="status">
          Loading sleeps…
        </p>
      ) : ready && days.length === 0 ? (
        <div className={`${CARD} px-4 py-6 text-center text-sm text-ink-soft`}>
          <b className="mb-1 block text-[15px] text-ink">No sleeps in this range</b>
          Tick Sleep on the Log screen to start one. Reports fill in as soon as the first sleep is
          stopped.
        </div>
      ) : ready ? (
        <Fragment key={rangeId}>
          <div className="flex flex-col gap-6">
            <SleepPatternCard days={days} />
            <SleepStatCards days={days} summary={summary} />
            <SleepPerDayChart days={days} />
            <SleepLongestChart days={days} />
            <SleepTable days={days} />
          </div>
        </Fragment>
      ) : null}
    </div>
  );
}
