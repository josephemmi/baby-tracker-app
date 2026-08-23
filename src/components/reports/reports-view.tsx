"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EntryRow } from "@/lib/entries";
import {
  availableYears,
  computeDailyStats,
  computeOverallStats,
  currentMonthValue,
  formatMinutes,
  filterEntriesByRange,
  type ReportRange,
} from "@/lib/reports";
import { StatCard } from "@/components/reports/stat-card";
import { BarChart } from "@/components/reports/bar-chart";
import { GroupedBarChart } from "@/components/reports/grouped-bar-chart";
import { fmtDuration } from "@/lib/breastfeed-timer";

type RangeKind = ReportRange["kind"];

const RANGE_OPTIONS: { value: RangeKind; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "all", label: "All time" },
];

export function ReportsView({
  entries: initialEntries,
  babyId,
}: {
  entries: EntryRow[];
  babyId: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  // Refreshed alongside entries, not just captured once — otherwise a
  // long-lived tab's date-relative ranges (Last 7 days, this month/year)
  // stay anchored to whatever moment the page first loaded.
  const [now, setNow] = useState(() => new Date());
  const lastRefetchAt = useRef(0);

  useEffect(() => {
    const supabase = createClient();

    // Unlike Home, this page has no realtime subscription — it's a report,
    // not a live log — but it still needs to not go stale while left open.
    // Same "we're back" signals and belt-and-braces poll Home already uses
    // (v1.4.1/v1.6.1), applied here since this page had none of them: a
    // pure one-shot server render with nothing keeping it fresh afterward.
    async function refetch() {
      lastRefetchAt.current = Date.now();
      const { data } = await supabase
        .from("entries")
        .select("*")
        .eq("baby_id", babyId)
        .order("timestamp", { ascending: true });

      if (data) {
        setEntries(data);
        setNow(new Date());
      }
    }

    function handleForeground() {
      if (document.visibilityState !== "visible") return;
      refetch();
    }

    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("pageshow", handleForeground);
    window.addEventListener("focus", handleForeground);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, 20_000);

    // Same iOS-PWA-relaunch fallback as Home: a resumed standalone app can
    // fail to fire any lifecycle event at all, but the user will still
    // touch the screen, so treat that as a trigger if it's been a while.
    function handleInteraction() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefetchAt.current > 5_000) refetch();
    }

    document.addEventListener("pointerdown", handleInteraction, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
      window.removeEventListener("focus", handleForeground);
      document.removeEventListener("pointerdown", handleInteraction);
      window.clearInterval(pollId);
    };
  }, [babyId]);

  const [rangeKind, setRangeKind] = useState<RangeKind>("all");
  const [month, setMonth] = useState(() => currentMonthValue(now));
  const years = useMemo(() => availableYears(entries), [entries]);
  const [year, setYear] = useState(() => years[0] ?? now.getFullYear());

  const range: ReportRange = useMemo(() => {
    if (rangeKind === "month") return { kind: "month", month };
    if (rangeKind === "year") return { kind: "year", year };
    return { kind: rangeKind };
  }, [rangeKind, month, year]);

  const filteredEntries = useMemo(
    () => filterEntriesByRange(entries, range, now),
    [entries, range, now],
  );

  const stats = useMemo(() => computeOverallStats(filteredEntries), [filteredEntries]);
  const dailyStats = useMemo(
    () => computeDailyStats(filteredEntries),
    [filteredEntries],
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        No entries yet — reports will appear once you start logging.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Date range" className="flex gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={rangeKind === option.value}
              onClick={() => setRangeKind(option.value)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-bold transition-colors ${
                rangeKind === option.value
                  ? "border-ink bg-ink text-paper-raised"
                  : "border-line-strong text-ink-soft hover:bg-paper-raised"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {rangeKind === "month" && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-[10px] border border-line-strong bg-paper-raised px-3 py-1.5 text-[13.5px] text-ink tabular-nums focus:border-sage focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-sage"
          />
        )}

        {rangeKind === "year" && (
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-[10px] border border-line-strong bg-paper-raised px-3 py-1.5 text-[13.5px] text-ink tabular-nums focus:border-sage focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-sage"
          >
            {years.length === 0 ? (
              <option value={year}>{year}</option>
            ) : (
              years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <p className="text-sm text-ink-soft">No entries in this range.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total feeds" value={String(stats.totalFeeds)} />
            <StatCard label="Bottle feeds" value={String(stats.bottleFeeds)} />
            <StatCard label="Breastfeeds" value={String(stats.breastFeeds)} />
            <StatCard
              label="Avg gap between feeds"
              value={
                stats.avgGapMinutes != null
                  ? formatMinutes(stats.avgGapMinutes)
                  : "—"
              }
            />
            <StatCard
              label="Pump sessions"
              value={String(stats.pumpSessions)}
              accent="plum"
            />
            <StatCard
              label="Total pumped"
              value={`${stats.totalPumpedMl} mL`}
              accent="plum"
            />
            <StatCard
              label="Breastfeed sessions"
              value={String(stats.breastfeedSessions)}
              accent="rose"
            />
            <StatCard
              label="Avg. session length"
              value={
                stats.avgBreastfeedSessionSeconds != null
                  ? fmtDuration(stats.avgBreastfeedSessionSeconds)
                  : "—"
              }
              accent="rose"
            />
          </div>

          <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
            <div className="mb-3 flex items-center gap-4 text-[11.5px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber" />
                Bottle mL logged
              </span>
            </div>
            <BarChart
              title="Bottle volume per day"
              data={dailyStats.map((day) => ({
                label: day.dayLabel,
                value: day.totalMl,
              }))}
              valueFormatter={(value) => `${value} mL`}
              color="amber"
              indicators={dailyStats.map((day) => day.breastCount > 0)}
            />
          </div>

          <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
            <div className="mb-3 flex items-center gap-4 text-[11.5px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber" />
                Bottle
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose" />
                Breast
              </span>
            </div>
            <GroupedBarChart
              title="Feeds by day, by method"
              series={[
                { key: "bottle", className: "bg-amber" },
                { key: "breast", className: "bg-rose" },
              ]}
              data={dailyStats.map((day) => ({
                label: day.dayLabel,
                values: { bottle: day.bottleCount, breast: day.breastCount },
              }))}
            />
          </div>

          <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
            <div className="mb-3 flex items-center gap-4 text-[11.5px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose" />
                Right
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-dark" />
                Left
              </span>
            </div>
            <GroupedBarChart
              title="Breastfeeding time by day"
              series={[
                { key: "right", className: "bg-rose" },
                { key: "left", className: "bg-rose-dark" },
              ]}
              data={dailyStats.map((day) => ({
                label: day.dayLabel,
                values: { right: day.breastRightSeconds, left: day.breastLeftSeconds },
              }))}
              valueFormatter={fmtDuration}
            />
          </div>

          <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
            <div className="mb-3 flex items-center gap-4 text-[11.5px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-plum" />
                Pumped mL (Jen)
              </span>
            </div>
            <BarChart
              title="Pumped volume per day"
              data={dailyStats.map((day) => ({
                label: day.dayLabel,
                value: day.pumpedMl,
                subLabel: day.pumpCount === 1 ? "1 session" : `${day.pumpCount} sessions`,
              }))}
              valueFormatter={(value) => `${value} mL`}
              color="plum"
            />
          </div>

          <div className="overflow-x-auto rounded-[10px] border border-line bg-paper-raised shadow-card">
            <table className="w-full min-w-[960px] border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-line-strong text-left text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
                  <th className="px-3 py-2.5">Day</th>
                  <th className="px-3 py-2.5 text-center">Bottle feeds</th>
                  <th className="px-3 py-2.5 text-center">Breastfeeds</th>
                  <th className="px-3 py-2.5 text-center">Right</th>
                  <th className="px-3 py-2.5 text-center">Left</th>
                  <th className="px-3 py-2.5 text-center">Breast total</th>
                  <th className="px-3 py-2.5 text-center">Total mL</th>
                  <th className="px-3 py-2.5 text-center">Avg mL/bottle</th>
                  <th className="px-3 py-2.5 text-center">Poo count</th>
                  <th className="px-3 py-2.5 text-center">Pee count</th>
                  <th className="px-3 py-2.5 text-center">Pump sessions</th>
                  <th className="px-3 py-2.5 text-center">Pumped mL</th>
                </tr>
              </thead>
              <tbody>
                {[...dailyStats].reverse().map((day) => (
                  <tr
                    key={day.dayKey}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-3 py-2.5 text-ink">{day.dayLabel}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.bottleCount}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.breastCount}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.breastRightSeconds > 0 ? fmtDuration(day.breastRightSeconds) : ""}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.breastLeftSeconds > 0 ? fmtDuration(day.breastLeftSeconds) : ""}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.breastRightSeconds + day.breastLeftSeconds > 0
                        ? fmtDuration(day.breastRightSeconds + day.breastLeftSeconds)
                        : ""}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.totalMl || ""}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.avgMlPerBottle != null ? day.avgMlPerBottle.toFixed(1) : ""}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.poopCount}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.peeCount}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.pumpCount}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">
                      {day.pumpedMl || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
