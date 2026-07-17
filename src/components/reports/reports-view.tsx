"use client";

import { useMemo } from "react";
import type { EntryRow } from "@/lib/entries";
import {
  computeDailyStats,
  computeOverallStats,
  formatMinutes,
} from "@/lib/reports";
import { StatCard } from "@/components/reports/stat-card";
import { BarChart } from "@/components/reports/bar-chart";

export function ReportsView({ entries }: { entries: EntryRow[] }) {
  const stats = useMemo(() => computeOverallStats(entries), [entries]);
  const dailyStats = useMemo(() => computeDailyStats(entries), [entries]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        No entries yet — reports will appear once you start logging.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total entries" value={String(stats.totalEntries)} />
        <StatCard label="Total feeds" value={String(stats.totalFeeds)} />
        <StatCard
          label="Avg mL / feed"
          value={
            stats.avgMlPerFeed != null ? stats.avgMlPerFeed.toFixed(1) : "—"
          }
        />
        <StatCard
          label="Avg gap between feeds"
          value={
            stats.avgGapMinutes != null
              ? formatMinutes(stats.avgGapMinutes)
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-[10px] border border-line bg-paper-raised p-4 shadow-card sm:grid-cols-2">
        <BarChart
          title="Feed volume per day"
          data={dailyStats.map((day) => ({
            label: day.dayLabel,
            value: day.totalMl,
          }))}
          valueFormatter={(value) => `${value} mL`}
          color="amber"
        />
        <BarChart
          title="Feed count per day"
          data={dailyStats.map((day) => ({
            label: day.dayLabel,
            value: day.feedCount,
          }))}
          color="sage"
        />
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-paper-raised shadow-card">
        <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
              <th className="px-3 py-2.5">Day</th>
              <th className="px-3 py-2.5">Feeds</th>
              <th className="px-3 py-2.5">Total mL</th>
              <th className="px-3 py-2.5">Avg mL/feed</th>
              <th className="px-3 py-2.5">Poo count</th>
              <th className="px-3 py-2.5">Pee count</th>
            </tr>
          </thead>
          <tbody>
            {[...dailyStats].reverse().map((day) => (
              <tr
                key={day.dayKey}
                className="border-b border-line last:border-0"
              >
                <td className="px-3 py-2.5 text-ink">{day.dayLabel}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {day.feedCount}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {day.totalMl || ""}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {day.avgMlPerFeed != null ? day.avgMlPerFeed.toFixed(1) : ""}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {day.poopCount}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {day.peeCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
