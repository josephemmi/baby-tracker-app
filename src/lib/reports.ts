import type { EntryRow } from "@/lib/entries";

export interface OverallStats {
  totalFeeds: number;
  bottleFeeds: number;
  breastFeeds: number;
  avgGapMinutes: number | null;
  pumpSessions: number;
  totalPumpedMl: number;
  breastfeedSessions: number;
  avgBreastfeedSessionSeconds: number | null;
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
  breastRightSeconds: number;
  breastLeftSeconds: number;
  breastSessionCount: number;
}

// An ended breastfeed session with real recorded time — excludes anything
// still in progress, matching how avgMlPerBottle already excludes bottle
// feeds logged with no amount.
function isFinishedBreastSession(entry: EntryRow): boolean {
  return (
    entry.type === "feed" &&
    entry.breast_session_ended &&
    (entry.breast_right_seconds > 0 || entry.breast_left_seconds > 0)
  );
}

// Reports buckets days, months and years in the household's timezone, not the
// device's (JOS-99): a phone set to another zone, or a server-rendered pass,
// must not move an entry across midnight.
export const REPORT_TIME_ZONE = "Europe/London";

const zoneParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: REPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function zonedYMD(timestamp: string): { y: string; m: string; d: string } {
  const parts = zoneParts.formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

function localDayKey(timestamp: string): string {
  const { y, m, d } = zonedYMD(timestamp);
  return `${y}-${m}-${d}`;
}

function localMonthKey(timestamp: string): string {
  const { y, m } = zonedYMD(timestamp);
  return `${y}-${m}`;
}

function localYear(timestamp: string): number {
  return Number(zonedYMD(timestamp).y);
}

// The one place Reports decides which rows count (JOS-99). Every stat, chart
// and table goes through it, so they cannot disagree:
//  - deleted rows never count (JOS-20 soft delete);
//  - the same id appearing twice (a refetch overlapping a realtime event)
//    counts once;
//  - a pump row with no amount is a ticked-but-unsaved session and is left out
//    until its amount is saved;
//  - the Log holds one pump per moment, so two pump rows with the same baby,
//    user and instant (a double tap inserts two) are one session: the most
//    recently created row is kept.
export function reportableEntries(entries: EntryRow[]): EntryRow[] {
  const byId = new Map<string, EntryRow>();
  for (const entry of entries) {
    if (entry.deleted_at) continue;
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }

  const pumpByMoment = new Map<string, EntryRow>();
  const result: EntryRow[] = [];
  for (const entry of byId.values()) {
    if (entry.type !== "pump") {
      result.push(entry);
      continue;
    }
    if (entry.amount_ml == null) continue;
    const key = `${entry.baby_id}|${entry.timestamp}|${entry.logged_by ?? "unknown"}`;
    const kept = pumpByMoment.get(key);
    if (!kept || entry.created_at > kept.created_at) pumpByMoment.set(key, entry);
  }
  return [...result, ...pumpByMoment.values()];
}

export type ReportRange =
  | { kind: "7d" }
  | { kind: "30d" }
  | { kind: "month"; month: string } // "YYYY-MM", local calendar month
  | { kind: "year"; year: number } // Europe/London calendar year
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
      return entries.filter((e) => localYear(e.timestamp) === range.year);
  }
}

// Distinct calendar years present in the data, most recent first — used to
// populate the "Yearly" range picker.
export function availableYears(entries: EntryRow[]): number[] {
  const years = new Set(entries.map((e) => localYear(e.timestamp)));
  return Array.from(years).sort((a, b) => b - a);
}

export function currentMonthValue(now: Date): string {
  return localMonthKey(now.toISOString());
}

function localDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function computeOverallStats(allEntries: EntryRow[]): OverallStats {
  const entries = reportableEntries(allEntries);
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

  const finishedBreastSessions = entries.filter(isFinishedBreastSession);
  const avgBreastfeedSessionSeconds =
    finishedBreastSessions.length > 0
      ? finishedBreastSessions.reduce(
          (sum, entry) => sum + entry.breast_right_seconds + entry.breast_left_seconds,
          0,
        ) / finishedBreastSessions.length
      : null;

  return {
    totalFeeds: feeds.length,
    bottleFeeds,
    breastFeeds,
    avgGapMinutes,
    pumpSessions: pumps.length,
    totalPumpedMl,
    breastfeedSessions: finishedBreastSessions.length,
    avgBreastfeedSessionSeconds,
  };
}

export function computeDailyStats(allEntries: EntryRow[]): DailyStat[] {
  const entries = reportableEntries(allEntries);
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
    breastRightSeconds: number;
    breastLeftSeconds: number;
    breastSessionCount: number;
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
      breastRightSeconds: 0,
      breastLeftSeconds: 0,
      breastSessionCount: 0,
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
      if (isFinishedBreastSession(entry)) {
        day.breastRightSeconds += entry.breast_right_seconds;
        day.breastLeftSeconds += entry.breast_left_seconds;
        day.breastSessionCount += 1;
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
