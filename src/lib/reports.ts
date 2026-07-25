import type { EntryRow } from "@/lib/entries";

export interface OverallStats {
  totalFeeds: number;
  bottleFeeds: number;
  breastFeeds: number;
  avgGapMinutes: number | null;
  pumpSessions: number;
  totalPumpedMl: number;
}

export interface DailyStat {
  dayKey: string;
  dayLabel: string;
  bottleCount: number;
  breastCount: number;
  totalMl: number;
  avgMlPerBottle: number | null;
  poopCount: number;
  peeCount: number;
  pumpCount: number;
  pumpedMl: number;
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
  const feeds = entries.filter(
    (entry) => entry.type === "feed" && (entry.bottle || entry.breast),
  );
  const bottleFeeds = feeds.filter((entry) => entry.bottle).length;
  const breastFeeds = feeds.filter((entry) => entry.breast).length;

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

  const pumps = entries.filter((entry) => entry.type === "pump");
  const totalPumpedMl = pumps.reduce((sum, entry) => sum + (entry.amount_ml ?? 0), 0);

  return {
    totalFeeds: feeds.length,
    bottleFeeds,
    breastFeeds,
    avgGapMinutes,
    pumpSessions: pumps.length,
    totalPumpedMl,
  };
}

export function computeDailyStats(entries: EntryRow[]): DailyStat[] {
  interface Accumulator {
    dayKey: string;
    dayLabel: string;
    bottleCount: number;
    breastCount: number;
    totalMl: number;
    bottleFeedsWithMl: number;
    poopCount: number;
    peeCount: number;
    pumpCount: number;
    pumpedMl: number;
  }

  const days = new Map<string, Accumulator>();

  for (const entry of entries) {
    const dayKey = localDayKey(entry.timestamp);
    const day = days.get(dayKey) ?? {
      dayKey,
      dayLabel: localDayLabel(dayKey),
      bottleCount: 0,
      breastCount: 0,
      totalMl: 0,
      bottleFeedsWithMl: 0,
      poopCount: 0,
      peeCount: 0,
      pumpCount: 0,
      pumpedMl: 0,
    };

    if (entry.type === "feed") {
      if (entry.bottle) {
        day.bottleCount += 1;
        if (entry.amount_ml != null) {
          day.totalMl += entry.amount_ml;
          day.bottleFeedsWithMl += 1;
        }
      }
      if (entry.breast) {
        day.breastCount += 1;
      }
    } else if (entry.type === "poop") {
      day.poopCount += 1;
    } else if (entry.type === "pee") {
      day.peeCount += 1;
    } else if (entry.type === "pump") {
      day.pumpCount += 1;
      if (entry.amount_ml != null) {
        day.pumpedMl += entry.amount_ml;
      }
    }

    days.set(dayKey, day);
  }

  return Array.from(days.values())
    .map(({ bottleFeedsWithMl, ...day }) => ({
      ...day,
      avgMlPerBottle: bottleFeedsWithMl > 0 ? day.totalMl / bottleFeedsWithMl : null,
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
