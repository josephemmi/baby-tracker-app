import type { EntryRow } from "@/lib/entries";

export interface OverallStats {
  totalEntries: number;
  totalFeeds: number;
  avgMlPerFeed: number | null;
  avgGapMinutes: number | null;
}

export interface DailyStat {
  dayKey: string;
  dayLabel: string;
  feedCount: number;
  totalMl: number;
  avgMlPerFeed: number | null;
  poopCount: number;
  peeCount: number;
}

function localDayKey(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMonthKey(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export type ReportRange =
  | { kind: "7d" }
  | { kind: "30d" }
  | { kind: "month"; month: string } // "YYYY-MM", local calendar month
  | { kind: "year"; year: number } // local calendar year
  | { kind: "all" };

export function filterEntriesByRange(
  entries: EntryRow[],
  range: ReportRange,
  now: Date,
): EntryRow[] {
  switch (range.kind) {
    case "all":
      return entries;
    case "7d": {
      const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    }
    case "30d": {
      const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    }
    case "month":
      return entries.filter((e) => localMonthKey(e.timestamp) === range.month);
    case "year":
      return entries.filter(
        (e) => new Date(e.timestamp).getFullYear() === range.year,
      );
  }
}

// Distinct calendar years present in the data, most recent first — used to
// populate the "Yearly" range picker.
export function availableYears(entries: EntryRow[]): number[] {
  const years = new Set(entries.map((e) => new Date(e.timestamp).getFullYear()));
  return Array.from(years).sort((a, b) => b - a);
}

export function currentMonthValue(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function localDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function computeOverallStats(entries: EntryRow[]): OverallStats {
  const feeds = entries.filter((entry) => entry.type === "feed");
  const mlValues = feeds
    .map((feed) => feed.amount_ml)
    .filter((value): value is number => value != null);
  const avgMlPerFeed = mlValues.length
    ? mlValues.reduce((sum, value) => sum + value, 0) / mlValues.length
    : null;

  const feedTimes = feeds
    .map((feed) => new Date(feed.timestamp).getTime())
    .sort((a, b) => a - b);

  let avgGapMinutes: number | null = null;
  if (feedTimes.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < feedTimes.length; i++) {
      gaps.push((feedTimes[i] - feedTimes[i - 1]) / 60000);
    }
    avgGapMinutes = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  }

  return {
    totalEntries: entries.length,
    totalFeeds: feeds.length,
    avgMlPerFeed,
    avgGapMinutes,
  };
}

export function computeDailyStats(entries: EntryRow[]): DailyStat[] {
  interface Accumulator {
    dayKey: string;
    dayLabel: string;
    feedCount: number;
    totalMl: number;
    feedsWithMl: number;
    poopCount: number;
    peeCount: number;
  }

  const days = new Map<string, Accumulator>();

  for (const entry of entries) {
    const dayKey = localDayKey(entry.timestamp);
    const day = days.get(dayKey) ?? {
      dayKey,
      dayLabel: localDayLabel(dayKey),
      feedCount: 0,
      totalMl: 0,
      feedsWithMl: 0,
      poopCount: 0,
      peeCount: 0,
    };

    if (entry.type === "feed") {
      day.feedCount += 1;
      if (entry.amount_ml != null) {
        day.totalMl += entry.amount_ml;
        day.feedsWithMl += 1;
      }
    } else if (entry.type === "poop") {
      day.poopCount += 1;
    } else if (entry.type === "pee") {
      day.peeCount += 1;
    }

    days.set(dayKey, day);
  }

  return Array.from(days.values())
    .map(({ feedsWithMl, ...day }) => ({
      ...day,
      avgMlPerFeed: feedsWithMl > 0 ? day.totalMl / feedsWithMl : null,
    }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export function formatMinutes(minutes: number): string {
  // Round the total first, then split — rounding hours and the leftover
  // minutes separately can produce a bogus "Xh 60m" when the remainder
  // rounds up to a full hour.
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}
