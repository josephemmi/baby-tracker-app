// What the Sleep tab in Reports and the Log's "Last sleep" tile say (JOS-83,
// v1.14): pure functions that turn sleeps into days, averages and a few
// right-now answers. Ported from the reference engine agreed with Joseph
// (sleep-stats.js in Drive, Docs / v1.14); the tests in sleep-reports.test.ts
// are its 52 hand-worked ones.
//
// THE MODEL (18 Oct 2026). There are no clock windows and no settings.
//  - A sleep is never cut. It belongs to the local DATE HE WOKE UP: the date
//    its last stretch ended.
//  - Of the finished sleeps that ended on a date, the one with the most time
//    asleep (pauses excluded) is that date's NIGHT, if it is at least
//    CFG.minNightMs (5 h). The rest are NAPS. A tie goes to the earlier sleep.
//    A date whose longest sleep is shorter has no night: they are all naps
//    (JOS-90, a change from the agreed model: with no minimum, the first day of
//    logging, which has no night in it, named a 3 h 50 m daytime sleep the
//    night and pulled the average bedtime to 1:13 am).
//  - A pause is part of the same sleep, however long (a sleep paused over 3 h
//    closes itself at its last wake). Stop then Start is two sleeps.
//  - A sleep still open (running or paused) is in NO total until he wakes. It
//    is "Sleeping now", with its time asleep so far.
//  - A night wake is a pause of 5 min or more inside the night sleep. A wake
//    window is the gap between two sleeps (5 min to 6 h; a longer gap is
//    probably an unlogged sleep), counted on the date he woke into it.
//  - A date is "partial" until local midnight: charted, never averaged.
//  - A date with no night is charted and listed but left out of every average
//    (JOS-90): its total is missing the night, so averaging it would drag the
//    daily total down (the first day of logging, or a night nobody logged).
//  - Known weak spot, accepted: stop-and-restart in the night makes the
//    shorter half a nap. Edit times (clear Ended) after a mistaken Stop avoids it.
//  - The 24-hour pattern is the one place a sleep is cut: `segments` on each
//    day are its stretches clipped to that CALENDAR day, for drawing only. The
//    time still counts once, on the day he woke.
//
// Times are UTC milliseconds like the rest of src/lib, but the day boundaries
// are the device's local calendar days, read with Date's local getters and
// stepped with `setDate`-style arithmetic so a day with a clock change is 23
// or 25 hours long and nothing drifts. That is why the tests pin a time zone.

import { HOUR, MIN, closedAtOf, type Sleep } from "@/lib/sleep";

export const CFG = {
  // The longest sleep that ended on a date is that date's night only if it is
  // at least this long (time asleep, pauses excluded); a shorter one is a nap
  // and the date has no night (JOS-90). Joseph's baby sleeps 10 to 13 h at
  // night and no more than 4 h in the day, so anything from 5 to 9 h separates
  // them. 5 h is the low end of that: it keeps the longer half of a night
  // split by a Stop and a Start (the accepted weak spot) a night, and still
  // sits above any daytime sleep. A newborn's nights may need a lower value.
  minNightMs: 5 * HOUR,
  // A pause or gap shorter than this is not a wake.
  minWakeMs: 5 * MIN,
  // A longer gap is probably an unlogged sleep, not time awake between sleeps.
  maxWakeWindowMs: 6 * HOUR,
} as const;

/* ---------- input ---------- */

export interface ReportStretch {
  start: number;
  // Null while the stretch is running.
  end: number | null;
}

// What the engine reads of a sleep. Deliberately smaller than `Sleep` so the
// tests can build one in a line; `toReportSleeps` makes them from the app's.
export interface ReportSleep {
  id: string;
  stretches: ReportStretch[];
  // Null while open (running or paused).
  closedAt: number | null;
  deletedAt: number | null;
}

// The app's sleeps as the engine wants them. One thing is derived on the way
// in: a sleep left paused for more than 3 h has closed itself at its last
// wake, but the database only writes `closed_at` when the next sleep starts,
// so without this it would read as paused for ever and sit in no total.
// (Sleeps in the app are live ones only, hence no deletedAt.)
export function toReportSleeps(sleeps: Sleep[], now: number): ReportSleep[] {
  return sleeps.map((s) => ({
    id: s.id,
    stretches: s.stretches,
    closedAt: closedAtOf(s, now),
    deletedAt: null,
  }));
}

/* ---------- local calendar days ---------- */

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

// "2026-10-16": the local date of an instant.
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-");
  return { y: +y, m: +m - 1, d: +d };
}

// The date `n` days after (or before) `key`. Read from noon so an hour
// skipped or repeated at midnight can not move it.
export function addDays(key: string, n: number): string {
  const k = parseKey(key);
  return dayKey(new Date(k.y, k.m, k.d + n, 12, 0, 0).getTime());
}

// The instant it is `h` o'clock on the local date `key`.
export function atHour(key: string, h: number): number {
  const k = parseKey(key);
  return new Date(k.y, k.m, k.d, h, 0, 0, 0).getTime();
}

const sumBy = <T>(a: T[], f: (x: T) => number): number => a.reduce((t, x) => t + f(x), 0);

const mean = (a: number[]): number | null => (a.length ? sumBy(a, (x) => x) / a.length : null);

// Minutes since local midnight.
export function clockMin(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/* ---------- sessions: the sleeps, tidied ---------- */

interface SessionStretch {
  s: number;
  e: number;
  running: boolean;
}

interface Session {
  id: string;
  stretches: SessionStretch[];
  finished: boolean;
  start: number;
  end: number;
  // Time asleep, pauses excluded.
  asleep: number;
  // Given once finished.
  kind: "night" | "nap" | null;
  // The date he woke (finished sleeps only).
  day: string | null;
}

// Sleeps to plain sessions, oldest first. A running stretch ends "now". Deleted
// sleeps and zero-length finished stretches are dropped; a running stretch of
// zero length is kept, so a sleep started this very moment is open at 0m
// instead of missing.
function normalise(sleeps: ReportSleep[], nowMs: number): Session[] {
  const out: Session[] = [];
  for (const sl of sleeps) {
    if (sl.deletedAt != null) continue;
    const st: SessionStretch[] = [];
    for (const x of sl.stretches) {
      const s = x.start;
      const e = x.end == null ? nowMs : x.end;
      if (e > s || (x.end == null && e === s)) st.push({ s, e, running: x.end == null });
    }
    if (!st.length) continue;
    st.sort((a, b) => a.s - b.s);
    out.push({
      id: sl.id,
      stretches: st,
      finished: sl.closedAt != null,
      start: st[0].s,
      end: st[st.length - 1].e,
      asleep: sumBy(st, (x) => x.e - x.s),
      kind: null,
      day: null,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// Gives every finished sleep its wake date and its label. Sessions arrive
// oldest first, so a tie for the longest goes to the earlier one. The longest
// is the night only if it is long enough to be one; otherwise the date has none.
function label(sessions: Session[]): void {
  const byDay: Record<string, Session[]> = {};
  for (const ss of sessions) {
    if (!ss.finished) continue;
    ss.day = dayKey(ss.end);
    (byDay[ss.day] = byDay[ss.day] || []).push(ss);
  }
  for (const k of Object.keys(byDay)) {
    let best = byDay[k][0];
    for (const ss of byDay[k]) if (ss.asleep > best.asleep) best = ss;
    const hasNight = best.asleep >= CFG.minNightMs;
    for (const ss of byDay[k]) ss.kind = hasNight && ss === best ? "night" : "nap";
  }
}

/* ---------- days ---------- */

export interface DaySleep {
  id: string;
  start: number;
  end: number;
  // Time asleep, pauses excluded.
  ms: number;
  kind: "night" | "nap";
}

// A piece of a stretch, clipped to one calendar day, for the 24-hour pattern.
export interface Segment {
  s: number;
  e: number;
  running: boolean;
}

export interface Day {
  // The local date, "2026-10-16".
  key: string;
  // Everything he slept that ended on this date: the night he woke from + naps.
  totalMs: number;
  nightMs: number;
  napMs: number;
  napCount: number;
  hasNight: boolean;
  // When the night sleep began (usually the evening before) and ended (on this
  // date). Null while there is no night.
  bedtime: number | null;
  wakeUp: number | null;
  longestNightStretchMs: number;
  nightWakes: number;
  wakeWindows: number[];
  // The finished sleeps that ended on this date, oldest first.
  sleeps: DaySleep[];
  segments: Segment[];
  // A sleep is running on this date.
  hasOpen: boolean;
  // Until local midnight: charted, never averaged.
  partial: boolean;
}

function newDay(key: string): Day {
  return {
    key,
    totalMs: 0,
    nightMs: 0,
    napMs: 0,
    napCount: 0,
    hasNight: false,
    bedtime: null,
    wakeUp: null,
    longestNightStretchMs: 0,
    nightWakes: 0,
    wakeWindows: [],
    sleeps: [],
    segments: [],
    hasOpen: false,
    partial: false,
  };
}

export function computeDays(sleeps: ReportSleep[], nowMs: number): Day[] {
  const sessions = normalise(sleeps, nowMs);
  label(sessions);
  const days: Record<string, Day> = {};
  const get = (key: string): Day => days[key] || (days[key] = newDay(key));

  // 1. Totals and labels: finished sleeps, on the date he woke. Open sleeps are
  //    in no total.
  for (const ss of sessions) {
    if (!ss.finished) continue;
    const d = get(ss.day as string);
    d.totalMs += ss.asleep;
    d.sleeps.push({
      id: ss.id,
      start: ss.start,
      end: ss.end,
      ms: ss.asleep,
      kind: ss.kind as "night" | "nap",
    });
    if (ss.kind === "night") {
      d.hasNight = true;
      d.nightMs = ss.asleep;
      d.bedtime = ss.start;
      d.wakeUp = ss.end;
      d.longestNightStretchMs = Math.max(...ss.stretches.map((x) => x.e - x.s));
      let wakes = 0;
      for (let i = 1; i < ss.stretches.length; i++) {
        if (ss.stretches[i].s - ss.stretches[i - 1].e >= CFG.minWakeMs) wakes += 1;
      }
      d.nightWakes = wakes;
    } else {
      d.napCount += 1;
      d.napMs += ss.asleep;
    }
  }

  // 2. Segments for the 24-hour pattern: every stretch (open ones too) clipped
  //    to each calendar day it touches.
  for (const ss of sessions) {
    for (const st of ss.stretches) {
      let a = st.s;
      while (a < st.e) {
        const k = dayKey(a);
        const b = Math.min(st.e, atHour(addDays(k, 1), 0));
        const d = get(k);
        d.segments.push({ s: a, e: b, running: st.running });
        if (st.running) d.hasOpen = true;
        a = b;
      }
    }
  }

  // 3. Wake windows: the gap after each finished sleep, on the date he woke
  //    into it.
  for (let i = 0; i < sessions.length - 1; i++) {
    const a = sessions[i];
    const b = sessions[i + 1];
    if (!a.finished) continue;
    const gap = b.start - a.end;
    if (gap < CFG.minWakeMs || gap > CFG.maxWakeWindowMs) continue;
    get(dayKey(a.end)).wakeWindows.push(gap);
  }

  const list = Object.keys(days)
    .sort()
    .map((k) => {
      const d = days[k];
      d.partial = nowMs < atHour(addDays(k, 1), 0);
      return d;
    });
  // The date before the first wake only holds the start of the first night:
  // nothing to chart.
  while (list.length && list[0].totalMs === 0 && !list[0].partial) list.shift();
  return list;
}

/* ---------- averages ---------- */

export interface Summary {
  // The days every average is made from: complete (today excluded) and with a
  // night, so a day with no night, whose total is missing it, is left out
  // (JOS-90). `nights` is the same count; it stays for the callers that ask
  // for nights.
  days: number;
  nights: number;
  avgTotalMs: number | null;
  avgNightMs: number | null;
  avgNapTimeMs: number | null;
  avgNaps: number | null;
  avgNapMs: number | null;
  // The one maximum, not an average: the best night's longest stretch.
  bestStretchMs: number | null;
  avgLongestStretchMs: number | null;
  avgNightWakes: number | null;
  avgWakeWindowMs: number | null;
  avgBedtimeMin: number | null;
  avgWakeUpMin: number | null;
}

export function summarise(days: Day[]): Summary {
  // A complete day with a night. (A night always has time asleep, so the total
  // is above 0 as well.)
  const done = days.filter((d) => !d.partial && d.hasNight);
  const nights = done;
  const napCount = sumBy(done, (d) => d.napCount);
  const napMs = sumBy(done, (d) => d.napMs);
  let windows: number[] = [];
  for (const d of done) windows = windows.concat(d.wakeWindows);
  // Bedtimes straddle midnight, so average them as minutes after noon.
  const bedOffsets = nights.map((d) => (clockMin(d.bedtime as number) - 720 + 1440) % 1440);
  const bedMean = mean(bedOffsets);
  return {
    days: done.length,
    nights: nights.length,
    avgTotalMs: mean(done.map((d) => d.totalMs)),
    avgNightMs: mean(nights.map((d) => d.nightMs)),
    avgNapTimeMs: mean(done.map((d) => d.napMs)),
    avgNaps: mean(done.map((d) => d.napCount)),
    avgNapMs: napCount ? napMs / napCount : null,
    bestStretchMs: nights.length ? Math.max(...nights.map((d) => d.longestNightStretchMs)) : null,
    avgLongestStretchMs: mean(nights.map((d) => d.longestNightStretchMs)),
    avgNightWakes: mean(nights.map((d) => d.nightWakes)),
    avgWakeWindowMs: mean(windows),
    avgBedtimeMin: bedMean == null ? null : Math.round((bedMean + 720) % 1440),
    avgWakeUpMin: mean(nights.map((d) => clockMin(d.wakeUp as number))),
  };
}

/* ---------- Today: the live card at the top of the Sleep tab ---------- */

export type TodayStatus = "asleep" | "paused" | "awake" | "none";

export interface TodayEntry {
  // "now" is the sleep under way.
  kind: "night" | "nap" | "now";
  start: number;
  end: number | null;
  ms: number;
  running: boolean;
  paused: boolean;
}

export interface Today {
  nowMs: number;
  // The calendar day, for the strip under the headline.
  window: { start: number; end: number };
  key: string;
  status: TodayStatus;
  // Since when: the running stretch's start while asleep, the last wake
  // otherwise.
  statusSince: number | null;
  // Awake for 12 h or more: probably a sleep nobody logged.
  awakeStale: boolean;
  asleepNow: boolean;
  pausedNow: boolean;
  sleepStart: number | null;
  sleepingNow: { start: number; ms: number; running: boolean; paused: boolean } | null;
  // Naps that have ended today ("Naps today"). A sleep still open is in no total.
  primaryMs: number;
  napCount: number;
  // Has any sleep ended today? False while the night is still running.
  woke: boolean;
  totalMs: number;
  entries: TodayEntry[];
  segments: Segment[];
}

export function today(sleeps: ReportSleep[], nowMs: number): Today {
  const sessions = normalise(sleeps, nowMs);
  const days = computeDays(sleeps, nowMs);
  const byKey: Record<string, Day> = {};
  for (const d of days) byKey[d.key] = d;
  const key = dayKey(nowMs);
  const cur = byKey[key] || newDay(key);
  cur.partial = true;

  // Right now: sleeping (a stretch is running), paused (open, none running) or
  // awake since the last wake.
  let open: Session | null = null;
  for (const ss of sessions) if (!ss.finished && ss.start <= nowMs) open = ss;
  const runningNow = !!open && open.stretches[open.stretches.length - 1].running;
  let stretchStart: number | null = null;
  let lastEnd: number | null = null;
  for (const ss of sessions) {
    for (const st of ss.stretches) {
      if (st.running) stretchStart = st.s;
      else if (st.e <= nowMs && (lastEnd == null || st.e > lastEnd)) lastEnd = st.e;
    }
  }
  const status: TodayStatus = runningNow
    ? "asleep"
    : open
      ? "paused"
      : lastEnd != null
        ? "awake"
        : "none";
  const statusSince = runningNow ? stretchStart : lastEnd;

  const entries: TodayEntry[] = cur.sleeps
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((x) => ({
      kind: x.kind,
      start: x.start,
      end: x.end,
      ms: x.ms,
      running: false,
      paused: false,
    }));
  if (open) {
    entries.push({
      kind: "now",
      start: open.start,
      end: null,
      ms: open.asleep,
      running: runningNow,
      paused: !runningNow,
    });
  }

  return {
    nowMs,
    window: { start: atHour(key, 0), end: atHour(addDays(key, 1), 0) },
    key,
    status,
    statusSince,
    awakeStale: status === "awake" && nowMs - (lastEnd as number) >= 12 * HOUR,
    asleepNow: runningNow,
    pausedNow: !!open && !runningNow,
    sleepStart: open ? open.start : null,
    sleepingNow: open
      ? { start: open.start, ms: open.asleep, running: runningNow, paused: !runningNow }
      : null,
    primaryMs: cur.napMs,
    napCount: cur.napCount,
    woke: cur.sleeps.length > 0,
    totalMs: cur.totalMs,
    entries,
    segments: cur.segments,
  };
}

/* ---------- Log: the "Last sleep" tile (next to Last feed / poo / pee) ---------- */

export interface Glance {
  open: boolean;
  state: "sleeping" | "paused" | "idle" | "none";
  // Time asleep so far in the open sleep, pauses excluded.
  openMs: number | null;
  openStart: number | null;
  last: { id: string; start: number; end: number; ms: number } | null;
}

// The tile follows the other tiles: it always shows the last COMPLETED sleep
// and only changes when a sleep is completed (or when the newest is deleted,
// which puts the previous one back). While a sleep is open the page adds a
// "Sleeping now" / "Paused" pill to the tile; `last` is unchanged. "Ago" counts
// from when he woke (its last stretch ended).
export function glance(sleeps: ReportSleep[], nowMs: number): Glance {
  const sessions = normalise(sleeps, nowMs);
  let open: Session | null = null;
  let last: Session | null = null;
  for (const ss of sessions) {
    if (ss.start > nowMs) continue;
    if (!ss.finished) open = ss;
    else if (last == null || ss.end > last.end) last = ss;
  }
  const running = !!open && open.stretches[open.stretches.length - 1].running;
  return {
    open: !!open,
    state: open ? (running ? "sleeping" : "paused") : last ? "idle" : "none",
    openMs: open ? open.asleep : null,
    openStart: open ? open.start : null,
    last: last ? { id: last.id, start: last.start, end: last.end, ms: last.asleep } : null,
  };
}

/* ---------- clock words ---------- */

// "7:50 pm": 12-hour, lowercase, like the rest of the app. Durations and
// "ago" are the app's own formatMinutes (reports.ts) and formatTimeAgo
// (entries.ts), which say the same words ("2h 30m", "just now", "4h 53m ago").
export function fmtClockMin(min: number | null): string {
  if (min == null) return "—";
  let h = Math.floor(min / 60) % 24;
  let m = Math.round(min % 60);
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ap}`;
}

export function fmtTime(ms: number | null): string {
  return ms == null ? "—" : fmtClockMin(clockMin(ms));
}
