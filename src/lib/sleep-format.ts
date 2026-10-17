// Everything about the Sleep tracker that depends on a *time zone* or on
// wording: 12-hour times, reading a wall-clock time the user picked, the
// preview line under the picker, and the sentences shown when the other
// parent got there first. Kept apart from sleep.ts so the rules there stay
// pure UTC arithmetic.
//
// The prototype hard-coded Europe/London. Production follows the device:
// `deviceZone` has no fixed zone, so Intl resolves the viewer's own. Tests
// build a zone with an explicit one.

import { formatTimeAgo } from "@/lib/entries";
import {
  HOUR,
  MIN,
  SLEEP_RULES,
  firstStart,
  lastStretch,
  pickBounds,
  type ReopenBlock,
  type Sleep,
  type SleepAction,
  type SleepError,
  type SleepField,
  type SleepWorld,
} from "@/lib/sleep";

export interface Zone {
  // "6:05 pm" — 12-hour with am/pm, never 24-hour (see formatTime() in
  // entries.ts, which the rest of the app uses for the same reason).
  fmtTime(ms: number): string;
  // "Fri 16 Oct"
  fmtDay(ms: number): string;
  // "2026-10-16" — the local calendar day.
  dayKey(ms: number): string;
  // The time, with the day in front of it unless it is today.
  fmtStamp(ms: number, now: number): string;
  // "HH:MM" from <input type="time"> -> the latest moment with that local
  // clock time that is not in the future, or NaN. Time only, no date: a time
  // later than now is read as yesterday, so "11:40 pm" at 12:05 am means last
  // night.
  fromClockInput(hhmm: string, now: number): number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function createZone(timeZone?: string): Zone {
  // en-US with h23 so the parts are plain 00–23; the wording is built by hand
  // below, so the viewer's locale can't turn "pm" into "PM" or "18:05".
  const partsFormat = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dayFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  function parts(ms: number) {
    const out: Record<string, string> = {};
    for (const p of partsFormat.formatToParts(new Date(ms))) out[p.type] = p.value;
    // Some engines report midnight as "24" even with h23.
    out.hour = pad2(Number(out.hour) % 24);
    return out;
  }

  // The local wall clock for an instant, read as if it were UTC.
  function wallMs(ms: number) {
    const p = parts(ms);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  }

  function offsetAt(ms: number) {
    const t = Math.floor(ms / 1000) * 1000;
    return wallMs(t) - t;
  }

  function toLocalInput(ms: number) {
    const p = parts(ms);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  const dayKey = (ms: number) => {
    const p = parts(ms);
    return `${p.year}-${p.month}-${p.day}`;
  };

  const fmtTime = (ms: number) => {
    const p = parts(ms);
    const h = Number(p.hour);
    return `${h % 12 || 12}:${p.minute} ${h < 12 ? "am" : "pm"}`;
  };

  // Built from parts so every browser gives "Sat 24 Oct" (some insert a
  // comma after the weekday).
  const fmtDay = (ms: number) => {
    const out: Record<string, string> = {};
    for (const p of dayFormat.formatToParts(new Date(ms))) out[p.type] = p.value;
    return `${out.weekday} ${out.day} ${out.month}`;
  };

  // "YYYY-MM-DDTHH:MM" local wall time -> instant. A wall time carries no
  // zone, so try the zone's offsets either side of it. When the clocks go back
  // a wall time happens twice: take the latest reading that is not in the
  // future. When they go forward it can not exist at all: NaN.
  function fromLocalInput(str: string, now: number) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str);
    if (!m) return NaN;
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const offsets = new Set([
      offsetAt(wall - 24 * HOUR),
      offsetAt(wall),
      offsetAt(wall + 24 * HOUR),
    ]);
    const candidates = [...offsets]
      .map((off) => wall - off)
      .filter((t) => toLocalInput(t) === str);
    if (candidates.length === 0) return NaN;
    const past = candidates.filter((t) => t <= now);
    return past.length > 0 ? Math.max(...past) : Math.min(...candidates);
  }

  const prevDayKey = (key: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) as RegExpExecArray;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - 1)).toISOString().slice(0, 10);
  };

  function fromClockInput(hhmm: string, now: number) {
    const m = /^(\d{2}):(\d{2})/.exec(hhmm || "");
    if (!m || +m[1] > 23 || +m[2] > 59) return NaN;
    const clock = `${m[1]}:${m[2]}`;
    const today = dayKey(now);
    const candidates = [today, prevDayKey(today)]
      .map((key) => fromLocalInput(`${key}T${clock}`, now))
      .filter((t) => Number.isFinite(t) && t <= now);
    return candidates.length > 0 ? Math.max(...candidates) : NaN;
  }

  return {
    fmtTime,
    fmtDay,
    dayKey,
    fmtStamp: (ms, now) =>
      dayKey(ms) === dayKey(now) ? fmtTime(ms) : `${fmtDay(ms)} ${fmtTime(ms)}`,
    fromClockInput,
  };
}

// Built lazily, on first use: constructing it at import time would also run
// on the server during SSR, where "the device's zone" means the server's.
let device: Zone | null = null;
export function deviceZone(): Zone {
  device ??= createZone();
  return device;
}

/* ---------- durations ---------- */

// The big timer: 01 h 35 m. Two digits for hours, two for minutes.
export function timerDigits(ms: number): { hours: string; minutes: string } {
  const total = Math.max(0, Math.floor(ms / MIN));
  return { hours: pad2(Math.floor(total / 60)), minutes: pad2(total % 60) };
}

// What a screen reader says for the timer.
export function timerSpoken(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} ${h === 1 ? "hour" : "hours"} ${m} ${m === 1 ? "minute" : "minutes"}`;
}

// "12 min", "1 h 5 min", "2 h" — the awake time on a paused card ("Awake 12
// min since 6:08 pm") and the length of a deleted sleep.
export function durationLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${total} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/* ---------- the time picker ---------- */

// "How long ago": an inline wheel, 5 minutes to 3 hours in 5-minute steps.
export const WHEEL_MINUTES: readonly number[] = Array.from(
  { length: 36 },
  (_, i) => (i + 1) * 5,
);
export const WHEEL_DEFAULT_MINUTES = 15;

export function agoLabel(minutes: number): string {
  const text =
    minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  return `${text} ago`;
}

// "18:05" -> "6:05 pm"
export function clockLabel(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
}

export interface Pick {
  field: SleepField;
  // The last choice wins: picking a time clears "How long ago" and rolling
  // the wheel clears the time.
  mode: "ago" | "time" | null;
  ago: number | null;
  time: string;
}

export function pickedMs(pick: Pick, now: number, zone: Zone): number {
  if (pick.mode === "ago" && pick.ago != null) return now - pick.ago * MIN;
  if (pick.mode === "time") return zone.fromClockInput(pick.time, now);
  return NaN;
}

// A wheel row is greyed (and can not be saved) when it would land outside the
// window the rules allow — e.g. before the previous sleep ended.
export function agoOutOfRange(
  world: SleepWorld,
  s: Sleep,
  field: SleepField,
  minutes: number,
): boolean {
  const { lo, hi } = pickBounds(world, s, field);
  const at = world.now - minutes * MIN;
  return at < lo || at > hi;
}

// The first wheel row that is allowed, preferring 15 minutes: opening the
// wheel selects a row straight away, like a phone's own wheel does.
export function defaultAgo(world: SleepWorld, s: Sleep, field: SleepField): number {
  const order = [WHEEL_DEFAULT_MINUTES, 10, 5, ...WHEEL_MINUTES.filter((m) => m > 15)];
  return order.find((m) => !agoOutOfRange(world, s, field, m)) ?? WHEEL_DEFAULT_MINUTES;
}

export interface Judgement {
  // idle: nothing chosen. ok / warn (more than 3 h ago: "Save anyway") / err.
  kind: "idle" | "ok" | "warn" | "err";
  text: string;
  ms: number;
}

// The preview line under the picker, and whether Save is allowed.
export function judgePick(
  world: SleepWorld,
  s: Sleep,
  pick: Pick,
  zone: Zone,
): Judgement {
  if (!pick.mode) return { kind: "idle", text: "", ms: NaN };

  const { now } = world;
  const ms = pickedMs(pick, now, zone);
  if (!Number.isFinite(ms)) return { kind: "err", text: "That is not a valid time.", ms };

  const { lo, hi } = pickBounds(world, s, pick.field);
  const yesterday = zone.dayKey(ms) !== zone.dayKey(now);
  const when = `${yesterday ? "yesterday " : ""}${zone.fmtTime(ms)}`;

  if (ms < lo) {
    const text =
      pick.field === "start"
        ? yesterday
          ? `Yesterday ${zone.fmtTime(ms)} is before the last sleep ended.`
          : `Before the last sleep ended (${zone.fmtTime(lo)}).`
        : yesterday
          ? `Yesterday ${zone.fmtTime(ms)} is before the sleep started.`
          : "Before the sleep started.";
    return { kind: "err", text, ms };
  }
  if (ms > hi) {
    const text =
      pick.field === "start"
        ? `That is after the sleep ended (${zone.fmtTime(hi + SLEEP_RULES.minStretchMs)}).`
        : "That is in the future.";
    return { kind: "err", text, ms };
  }

  const ago = formatTimeAgo(new Date(ms).toISOString(), new Date(now));
  if (now - ms > 3 * HOUR) {
    return { kind: "warn", text: `${when} · ${ago} · long ago, is that right?`, ms };
  }
  return { kind: "ok", text: `${when} · ${ago}`, ms };
}

/* ---------- sentences for when the other parent got there first ---------- */

const VERB: Record<SleepAction, string> = {
  start: "started this sleep",
  pause: "paused this sleep",
  resume: "put this sleep back on",
  finish: "finished this sleep",
  reopen: "reopened this sleep",
  edit: "edited this sleep",
  delete: "deleted this sleep",
  restore: "restored this sleep",
};

// Why Reopen sleep isn't offered, in one sentence. The line under a finished
// card that can't be reopened, and the message when a reopen is refused after
// the screen was already out of date, say the same thing.
export function reopenHint(reason: ReopenBlock): string {
  const why = {
    "not-finished": "it is still running",
    autoclosed: `it closed itself after ${SLEEP_RULES.autoCloseMs / HOUR} hours paused`,
    newer: "a new sleep has started",
    expired: `it ended more than ${SLEEP_RULES.reopenMs / HOUR} hours ago`,
  }[reason];
  return `This sleep can't be reopened: ${why}.`;
}

// The text for a SleepError — from the rules here, or rebuilt from what the
// server's conflict response said. `nameOf` turns a member id into a name.
export function describeSleepError(
  err: SleepError,
  zone: Zone,
  now: number,
  nameOf: (memberId: string | null) => string,
): string {
  const d = err.data;
  const time = (ms: number | undefined) => (ms == null ? "" : zone.fmtTime(ms));

  switch (err.code) {
    case "gone":
      return "That sleep was deleted.";
    case "stale":
      return `${nameOf(d.by ?? null)} already ${VERB[d.action ?? "edit"]} (${time(d.at)}).`;
    case "autoclosed":
      return `This sleep closed itself after ${SLEEP_RULES.autoCloseMs / HOUR} h paused (at ${time(d.at)}).`;
    case "already-open":
      return d.other
        ? `${nameOf(d.other.by)} already has a sleep running (started ${time(firstStart(d.other))}).`
        : "A sleep is already running.";
    case "future":
      return "That time is in the future.";
    case "short":
      return "Pause needs a minute of sleep first. Stop Sleep works any time.";
    case "before-wake":
      return `That is before the pause began at ${time(d.limit)}.`;
    case "inverted":
      return d.stretchStart != null
        ? `That is before this stretch began at ${time(d.stretchStart)}.`
        : "A stretch ends before it starts.";
    case "overlap": {
      if (!d.other) return "That overlaps another sleep.";
      const end = d.other.closedAt ?? lastStretch(d.other).end ?? now;
      return `That overlaps the sleep from ${zone.fmtStamp(firstStart(d.other), now)} to ${zone.fmtStamp(end, now)}.`;
    }
    case "before-prev":
      return `Before the last sleep ended (${time(d.limit)}).`;
    case "after-end":
      return `That is after the sleep ended (${time(d.limit)}).`;
    case "before-start":
      return "Before the sleep started.";
    case "no-reopen":
      return reopenHint(d.reason ?? "not-finished");
    case "bad-time":
      return "That is not a valid time.";
    case "open":
    case "order":
    case "empty":
      return "Those times do not fit together.";
  }
}
