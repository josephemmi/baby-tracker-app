// What the Sleep tab in Reports and the Log's "Last sleep" tile put on screen
// (JOS-83): the words, the ranges and the chart geometry, worked out from the
// engine's days (sleep-reports.ts). Pure, so the exact wording from the spec is
// pinned by tests instead of by eye on a phone; the components only draw it.

import { formatTimeAgo } from "@/lib/entries";
import { formatMinutes, type ReportRange } from "@/lib/reports";
import { HOUR, MIN, lastStretch, type Sleep } from "@/lib/sleep";
import { joinTimes } from "@/lib/sleep-format";
import {
  CFG,
  addDays,
  atHour,
  fmtClockMin,
  fmtTime,
  type Day,
  type Glance,
  type Summary,
  type Today,
} from "@/lib/sleep-reports";

/* ---------- small words ---------- */

// "2h 30m"; a dash when there is nothing to average yet.
export const dur = (ms: number | null): string => (ms == null ? "—" : formatMinutes(ms / MIN));

// One decimal, no trailing ".0": "3.4", "3".
export const num1 = (x: number | null): string =>
  x == null ? "—" : String(Math.round(x * 10) / 10);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The parts of a day key, read at noon so a clock change can't move the date.
function dayParts(key: string): { wd: string; dd: number; mo: string } {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return { wd: WEEKDAYS[date.getDay()], dd: date.getDate(), mo: MONTHS[date.getMonth()] };
}

// "Fri 16 Oct"
export function labelLong(key: string): string {
  const p = dayParts(key);
  return `${p.wd} ${p.dd} ${p.mo}`;
}

// "Fri 16"
export function labelShort(key: string): string {
  const p = dayParts(key);
  return `${p.wd} ${p.dd}`;
}

// "9:35 – 10:50 am", "7:25 pm – 6:51 am", or "7:50 pm → now" while it runs.
export function fmtRange(start: number, end: number | null): string {
  return end == null ? `${fmtTime(start)} → now` : joinTimes(fmtTime(start), fmtTime(end));
}

/* ---------- ranges ---------- */

// The same five ranges as Feeds & nappies, but by LOCAL CALENDAR DAY: Last 7
// days is today and the six before it, whole days, not 168 hours back.
export function filterDaysByRange(days: Day[], range: ReportRange, todayKey: string): Day[] {
  switch (range.kind) {
    case "all":
      return days;
    case "7d":
      return days.filter((d) => d.key > addDays(todayKey, -7) && d.key <= todayKey);
    case "30d":
      return days.filter((d) => d.key > addDays(todayKey, -30) && d.key <= todayKey);
    case "month":
      return days.filter((d) => d.key.slice(0, 7) === range.month);
    case "year":
      return days.filter((d) => d.key.slice(0, 4) === String(range.year));
  }
}

// How far back the sleeps for a range start, so the screen asks for no more
// than it draws: the first day of the range, less one day, because a night that
// ends on the first day began on the one before. The monthly, yearly and
// all-time ranges read everything (null): the pickers offer any month and any
// year that has sleeps in it, and a narrower read would hide the others.
export function fetchFromMs(kind: ReportRange["kind"], todayKey: string): number | null {
  // Last 7 days start 6 days back, so the read starts 7 back; Last 30 days: 29 and 30.
  if (kind === "7d") return atHour(addDays(todayKey, -7), 0);
  if (kind === "30d") return atHour(addDays(todayKey, -30), 0);
  return null;
}

// Years that have a day in them, most recent first: the Yearly picker.
export function sleepYears(days: Day[]): number[] {
  return Array.from(new Set(days.map((d) => Number(d.key.slice(0, 4))))).sort((a, b) => b - a);
}

// The day a chart opens pinned on: the newest complete day, or the newest day
// when only today is there.
export function defaultDayKey(days: Day[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) if (!days[i].partial) return days[i].key;
  return days.length ? days[days.length - 1].key : null;
}

/* ---------- averages ---------- */

// The days the averages are made from: complete (not today) and with a night,
// the same test as `summarise` (JOS-90).
const averaged = (days: Day[]): Day[] => days.filter((d) => !d.partial && d.hasNight);

// Complete days that have sleep but no night: charted and listed, but left out
// of every average, because their total is missing the night.
const leftOut = (days: Day[]): Day[] => days.filter((d) => !d.partial && d.totalMs > 0 && !d.hasNight);

// "Sun 11 – Fri 16 Oct": the complete days the averages are made from.
export function periodText(days: Day[]): string {
  const done = averaged(days);
  if (!done.length) return "";
  const a = done[0].key;
  const b = done[done.length - 1].key;
  if (a === b) return labelLong(b);
  const pa = dayParts(a);
  const pb = dayParts(b);
  return `${pa.wd} ${pa.dd}${pa.mo !== pb.mo ? ` ${pa.mo}` : ""} – ${labelLong(b)}`;
}

// "Sat 17", "Sat 17 and Sun 18", "Sat 17, Sun 18 and Mon 19"; past three, a count.
function dayList(keys: string[]): string {
  if (keys.length > 3) return `${keys.length} days`;
  const names = keys.map(labelShort);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The line under the "Averages" heading: which days they cover, and which
// complete days are left out because no night is logged on them.
export function averagesNote(days: Day[], sum: Summary): string {
  const left = leftOut(days).map((d) => d.key);
  const noNight = left.length ? " (no night sleep logged)" : "";
  if (sum.days === 0) {
    if (left.length) {
      return `No complete days with a night in this range yet. Today so far, and ${dayList(left)}${noNight}, are charted but not included.`;
    }
    return "No complete days in this range yet. Today so far is charted but not included.";
  }
  const count = `${periodText(days)} · ${sum.days} complete day${sum.days === 1 ? "" : "s"}.`;
  if (!left.length) return `${count} Today so far is not included.`;
  return `${count} Not included: today so far, and ${dayList(left)}${noNight}.`;
}

// Under the "Averages" title, whatever the range: the averages count only the
// sleeps that were logged, and nothing is estimated (JOS-90). The line after it
// (averagesNote) says which days that left out this time.
export function loggedNote(): string {
  return "Only sleeps that were logged are counted. If a night wasn't added, that day is left out of the averages.";
}

// The line under the cards: what a night is, and which day it counts on.
export function nightNote(): string {
  return `A night is a sleep of ${CFG.minNightMs / HOUR} hours or more. It counts on the day he woke.`;
}

export interface StatCardModel {
  // Never abbreviated, never a slash.
  label: string;
  // A part of the label that must not break across lines ("wake-up").
  keepTogether?: string;
  value: string;
  sub?: string;
  wide?: boolean;
}

// Nine cards, all averages over the complete days of the range that have a
// night, except the one maximum, "Longest unbroken sleep". The night is shown as
// PART of the daily total, never beside it as if it were another period. The
// labels say what they measure (JOS-90): "time asleep per day" is the whole
// day, "length of night sleep" is the night alone, and bedtime and wake-up say
// which end of the night they are.
export function averageCards(sum: Summary): StatCardModel[] {
  return [
    { label: "Average time asleep per day", value: dur(sum.avgTotalMs), sub: "Night + naps" },
    { label: "Average length of night sleep", value: dur(sum.avgNightMs), sub: "Part of the daily total" },
    { label: "Average naps per day", value: num1(sum.avgNaps) },
    { label: "Average nap length", value: dur(sum.avgNapMs) },
    { label: "Average bedtime", value: fmtClockMin(sum.avgBedtimeMin), sub: "When the night sleep starts" },
    {
      label: "Average wake-up time",
      keepTogether: "wake-up",
      value: fmtClockMin(sum.avgWakeUpMin),
      sub: "When the night sleep ends",
    },
    { label: "Longest unbroken sleep", value: dur(sum.bestStretchMs), sub: "Best night in this period" },
    { label: "Average wakes per night", value: num1(sum.avgNightWakes) },
    { label: "Average time awake between sleeps", value: dur(sum.avgWakeWindowMs), wide: true },
  ];
}

/* ---------- charts ---------- */

// Rounds up to a whole number of steps, never below one step.
export const niceMax = (ms: number, step: number): number => Math.max(Math.ceil(ms / step) * step, step);

export interface AxisTick {
  label: string;
  // Percent up from the bottom.
  pct: number;
}

// Zero, half and the top, in whole hours.
export function axisTicks(maxMs: number): AxisTick[] {
  return [0, maxMs / 2, maxMs].map((t) => ({ label: `${Math.round(t / HOUR)}h`, pct: (t / maxMs) * 100 }));
}

export interface XLabel {
  weekday: string;
  date: number;
  // Only where the month changes (and on the first label).
  month: string;
}

export function xLabels(days: Day[]): XLabel[] {
  let prev: string | null = null;
  return days.map((d) => {
    const p = dayParts(d.key);
    const month = p.mo !== prev ? p.mo : "";
    prev = p.mo;
    return { weekday: p.wd, date: p.dd, month };
  });
}

export const wakeWord = (n: number): string => `${n} wake${n === 1 ? "" : "s"}`;
const napWord = (n: number): string => `${n} nap${n === 1 ? "" : "s"}`;

export interface BarModel {
  key: string;
  partial: boolean;
  // Percent of the plot height.
  pct: number;
  // What a screen reader says for the bar, and what the readout box shows.
  label: string;
  readout: string;
}

export interface StackedBarModel extends BarModel {
  nightMs: number;
  napMs: number;
}

export interface ChartModel<T> {
  maxMs: number;
  ticks: AxisTick[];
  bars: T[];
}

// Sleep per day: the whole bar is the day's total, night solid underneath and
// naps hatched on top. Today, still in progress, is dashed and lighter.
export function stackedChart(days: Day[]): ChartModel<StackedBarModel> {
  const maxMs = niceMax(Math.max(0, ...days.map((d) => d.totalMs)), 2 * HOUR);
  return {
    maxMs,
    ticks: axisTicks(maxMs),
    bars: days.map((d) => {
      const detail = `${dur(d.totalMs)} asleep, night ${dur(d.nightMs)}, naps ${dur(d.napMs)}`;
      return {
        key: d.key,
        partial: d.partial,
        pct: (d.totalMs / maxMs) * 100,
        nightMs: d.nightMs,
        napMs: d.napMs,
        label: `${labelLong(d.key)}${d.partial ? " so far" : ""}: ${detail}`,
        readout: `${labelLong(d.key)}${d.partial ? " (so far)" : ""} · ${dur(d.totalMs)} asleep · night ${dur(d.nightMs)} · naps ${dur(d.napMs)}`,
      };
    }),
  };
}

export interface LongestBarModel extends BarModel {
  hasNight: boolean;
  // The wake count under the bar; "–" when there is no night yet.
  wakes: string;
}

// Longest stretch & night wakes: one bar per night, the wake count under it.
export function longestChart(days: Day[]): ChartModel<LongestBarModel> {
  const values = days.map((d) => (d.hasNight ? d.longestNightStretchMs : 0));
  const maxMs = niceMax(Math.max(HOUR, ...values), 2 * HOUR);
  return {
    maxMs,
    ticks: axisTicks(maxMs),
    bars: days.map((d, i) => {
      const detail = d.hasNight
        ? `longest stretch ${dur(d.longestNightStretchMs)}, ${wakeWord(d.nightWakes)}`
        : "no night sleep logged yet";
      return {
        key: d.key,
        partial: d.partial,
        pct: (values[i] / maxMs) * 100,
        hasNight: d.hasNight,
        wakes: d.hasNight ? String(d.nightWakes) : "–",
        label: `${labelLong(d.key)}: ${detail}`,
        readout: `${labelLong(d.key)} · ${
          d.hasNight
            ? `longest stretch ${dur(d.longestNightStretchMs)} · ${wakeWord(d.nightWakes)}`
            : "no night sleep logged yet"
        }`,
      };
    }),
  };
}

// "Fri 16 Oct · 14h 55m asleep · night 7:12 pm → 7:11 am · 4 naps · 1 wake"
export function patternText(d: Day): string {
  const parts = [`${labelLong(d.key)}${d.partial ? " so far" : ""}`, `${dur(d.totalMs)} asleep`];
  if (d.hasNight) parts.push(`night ${fmtTime(d.bedtime)} → ${fmtTime(d.wakeUp)}`);
  parts.push(napWord(d.napCount));
  if (d.hasNight) parts.push(wakeWord(d.nightWakes));
  return parts.join(" · ");
}

export interface PatternPiece {
  // Percent along the row, 12 am to 12 am. A day with a clock change is 23 or
  // 25 hours long, so this is measured against that day's own length.
  left: number;
  width: number;
  running: boolean;
}

export interface PatternRow {
  key: string;
  partial: boolean;
  label: string;
  readout: string;
  pieces: PatternPiece[];
}

// One row per calendar day, the latest 14, newest first. A night is two rows
// (evening on one, morning on the next) though it counts once.
export function patternRows(days: Day[]): PatternRow[] {
  return days
    .slice(-14)
    .reverse()
    .map((d) => {
      const from = atHour(d.key, 0);
      const span = atHour(addDays(d.key, 1), 0) - from;
      return {
        key: d.key,
        partial: d.partial,
        label: labelShort(d.key),
        readout: patternText(d),
        pieces: d.segments.map((g) => ({
          left: ((g.s - from) / span) * 100,
          width: ((g.e - g.s) / span) * 100,
          running: g.running,
        })),
      };
    });
}

// Under the pattern's title: how to read a row, and that only logged sleeps are
// drawn, so a night nobody added leaves a gap rather than a guess (JOS-90).
export function patternNote(): string {
  return "One row per calendar day. A night shows on two rows but counts on the day he woke. Only sleeps that were logged are drawn, so a night nobody added leaves a gap.";
}

/* ---------- the status pill ---------- */

export type PillVariant = "asleep" | "paused" | "awake" | "none";

export interface PillModel {
  variant: PillVariant;
  text: string;
  // What a screen reader says where the pill is not a live region (the Log).
  label?: string;
  // One line under the pill.
  caption?: string;
}

// "Sleeping now · 1h 14m" / "Paused · 1h 14m": the time is time asleep so far,
// pauses excluded, the same figure as that sleep's row in the list.
export function openPill(state: "sleeping" | "paused", asleepMs: number): PillModel {
  const word = state === "sleeping" ? "Sleeping now" : "Paused";
  return {
    variant: state === "sleeping" ? "asleep" : "paused",
    text: `${word} · ${dur(asleepMs)}`,
    label: `${word}, ${dur(asleepMs)} asleep so far`,
  };
}

/* ---------- the Today card ---------- */

// The Today card redraws every second while a sleep is open, so it should not
// walk a year of sleeps each time. It draws today and last night, so it needs
// only the last two weeks, plus the one sleep before them: that is what keeps
// "Awake since ..." right after a long gap. Anything older changes none of it.
export function recentForToday(sleeps: Sleep[], now: number, days = 14): Sleep[] {
  const from = now - days * 24 * HOUR;
  // A running sleep ends "now", so it is always inside.
  const endOf = (s: Sleep) => lastStretch(s).end ?? now;
  let before: Sleep | null = null;
  const kept: Sleep[] = [];
  for (const s of sleeps) {
    if (endOf(s) >= from) kept.push(s);
    else if (before === null || endOf(s) > endOf(before)) before = s;
  }
  return before ? [before, ...kept] : kept;
}

export function todayPill(td: Today): PillModel {
  if (td.sleepingNow) return openPill(td.sleepingNow.running ? "sleeping" : "paused", td.sleepingNow.ms);
  if (td.status === "awake" && td.statusSince != null) {
    if (td.awakeStale) {
      return { variant: "awake", text: "Awake", caption: `no sleep logged since ${fmtTime(td.statusSince)}` };
    }
    return { variant: "awake", text: `Awake · ${dur(td.nowMs - td.statusSince)}` };
  }
  return { variant: "none", text: "No sleeps logged yet" };
}

// The line under the "Naps today" number, only when there is no nap to show.
export function todayCaption(td: Today): string | null {
  if (!td.woke) return td.sleepingNow ? "Nothing finished yet today" : "No sleep logged today";
  return td.napCount ? null : "No naps yet";
}

export interface TodayRow {
  tone: "muted" | "normal" | "now";
  label: string;
  range: string;
  duration: string;
}

// One row per sleep that ended today, then the one under way.
export function todayRows(td: Today): TodayRow[] {
  let napN = 0;
  return td.entries.map((e) => {
    if (e.kind === "night") {
      return { tone: "muted", label: "Last night", range: fmtRange(e.start, e.end), duration: dur(e.ms) };
    }
    if (e.kind === "nap") {
      napN += 1;
      return { tone: "normal", label: `Nap ${napN}`, range: fmtRange(e.start, e.end), duration: dur(e.ms) };
    }
    return {
      tone: "now",
      label: e.paused ? "Paused" : "Sleeping",
      range: fmtRange(e.start, null),
      duration: dur(e.ms),
    };
  });
}

export interface StripModel {
  pieces: PatternPiece[];
  // Where "now" is along the day, 0 to 100.
  nowPct: number;
  description: string;
}

// The day strip, midnight to midnight, with a "now" line.
export function todayStrip(td: Today): StripModel {
  const span = td.window.end - td.window.start;
  const pieces = td.segments.map((g) => ({
    left: ((g.s - td.window.start) / span) * 100,
    width: ((g.e - g.s) / span) * 100,
    running: g.running,
  }));
  const description = td.segments.length
    ? `Asleep ${td.segments.map((g) => `${fmtTime(g.s)} to ${g.running ? "now" : fmtTime(g.e)}`).join(", ")}`
    : "No sleep logged today";
  return {
    pieces,
    nowPct: Math.min(100, Math.max(0, ((td.nowMs - td.window.start) / span) * 100)),
    description,
  };
}

/* ---------- the table ---------- */

export const TABLE_COLUMNS = [
  "Day",
  "Total",
  "Night",
  "Nap time",
  "Naps",
  "Longest",
  "Wakes",
  "Bedtime",
  "Up at",
] as const;

export interface TableRowModel {
  key: string;
  day: string;
  partial: boolean;
  // Everything after the day, in column order.
  cells: string[];
}

// Newest first. Night + naps adds up to the total on every row.
export function tableRows(days: Day[]): TableRowModel[] {
  return days
    .slice()
    .reverse()
    .map((d) => ({
      key: d.key,
      day: labelLong(d.key),
      partial: d.partial,
      cells: [
        dur(d.totalMs),
        d.hasNight ? dur(d.nightMs) : "—",
        dur(d.napMs),
        String(d.napCount),
        d.hasNight ? dur(d.longestNightStretchMs) : "—",
        d.hasNight ? String(d.nightWakes) : "—",
        d.hasNight ? fmtTime(d.bedtime) : "—",
        d.hasNight ? fmtTime(d.wakeUp) : "—",
      ],
    }));
}

/* ---------- the Log's "Last sleep" tile ---------- */

export interface LastSleepTile {
  // "4h 53m ago", or "Not logged yet".
  value: string;
  // "Slept 40m", beside the value.
  detail: string | null;
  none: boolean;
  // Inside the tile while a sleep is open. The tile itself does not change.
  pill: PillModel | null;
}

// The tile follows the other tiles: it always shows the last COMPLETED sleep
// and changes only when a sleep completes (or the newest is deleted). An open
// sleep adds a pill; it never replaces the value.
export function lastSleepTile(g: Glance, nowMs: number): LastSleepTile {
  const pill = g.open && g.openMs != null ? openPill(g.state === "paused" ? "paused" : "sleeping", g.openMs) : null;
  if (!g.last) return { value: "Not logged yet", detail: null, none: true, pill };
  return {
    value: formatTimeAgo(new Date(g.last.end).toISOString(), new Date(nowMs)),
    detail: `Slept ${dur(g.last.ms)}`,
    none: false,
    pill,
  };
}
