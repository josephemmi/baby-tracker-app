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
      <p className="text-sm text-zinc-500">
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

      <div className="grid grid-cols-1 gap-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
        <BarChart
          title="Feed volume per day"
          data={dailyStats.map((day) => ({
            label: day.dayLabel,
            value: day.totalMl,
          }))}
          valueFormatter={(value) => `${value} mL`}
        />
        <BarChart
          title="Feed count per day"
          data={dailyStats.map((day) => ({
            label: day.dayLabel,
            value: day.feedCount,
          }))}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100 text-left text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">Feeds</th>
              <th className="px-3 py-2 font-medium">Total mL</th>
              <th className="px-3 py-2 font-medium">Avg mL/feed</th>
              <th className="px-3 py-2 font-medium">Poo count</th>
              <th className="px-3 py-2 font-medium">Pee count</th>
            </tr>
          </thead>
          <tbody>
            {[...dailyStats].reverse().map((day) => (
              <tr
                key={day.dayKey}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {day.dayLabel}
                </td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {day.feedCount}
                </td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {day.totalMl || ""}
                </td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {day.avgMlPerFeed != null ? day.avgMlPerFeed.toFixed(1) : ""}
                </td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {day.poopCount}
                </td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
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
