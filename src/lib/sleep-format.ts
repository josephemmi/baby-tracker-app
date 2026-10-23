// Everything about the Sleep tracker that depends on a *time zone* or on
// wording: 12-hour times, reading a wall-clock time the user picked, the
// preview line under the picker, and the sentences shown when the other
// parent got there first. Kept apart from sleep.ts so the rules there stay
// pure UTC arithmetic.
//
// The prototype hard-coded Europe/London. Production follows the device:
// `deviceZone` has no fixed zone, so Intl resolves the viewer's own. Tests
// build a zone with an explicit one.

import { formatMinutes } from "@/lib/reports";
import {
  HOUR,
  MIN,
  SLEEP_RULES,
  asleepMs,
  closedAtOf,
  firstStart,
  lastStretch,
  stateOf,
  type Sleep,
  type EditRule,
  type SleepAction,
  type SleepError,
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
  // Minutes since local midnight, 0-1439: what a time reads on the wall clock.
  clockOf(ms: number): number;
  // The instant whose wall clock reads `minutes` on the local day that is
  // `dayOffset` days from the day of `ms`. Always an instant (JOS-103): a time
  // that does not exist (the clocks went forward) lands an hour later, as
  // JavaScript's own Date does, and one that happens twice (they went back)
  // takes the reading nearest to `ms`.
  atClock(ms: number, dayOffset: number, minutes: number): number;
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

  function clockOf(ms: number) {
    const p = parts(ms);
    return Number(p.hour) * 60 + Number(p.minute);
  }

  function atClock(ms: number, dayOffset: number, minutes: number) {
    const p = parts(ms);
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day + dayOffset, 0, minutes);
    const offsets = new Set([
      offsetAt(wall - 24 * HOUR),
      offsetAt(wall),
      offsetAt(wall + 24 * HOUR),
    ]);
    const exact = [...offsets].map((off) => wall - off).filter((t) => wallMs(t) === wall);
    if (exact.length > 0) {
      return exact.reduce((best, t) => (Math.abs(t - ms) < Math.abs(best - ms) ? t : best));
    }
    // In the gap: read it with the offset from before the clocks moved.
    return wall - offsetAt(wall - 24 * HOUR);
  }

  return {
    fmtTime,
    fmtDay,
    dayKey,
    fmtStamp: (ms, now) =>
      dayKey(ms) === dayKey(now) ? fmtTime(ms) : `${fmtDay(ms)} ${fmtTime(ms)}`,
    clockOf,
    atClock,
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

/* ---------- the pauses ---------- */

// One completed pause: `index` is the 0-based number of the stretch before it,
// which is what Remove sends.
export interface PauseRow {
  index: number;
  start: number;
  end: number;
}

export interface PauseList {
  rows: PauseRow[];
  // The pause still going — a paused sleep only, from its last wake. It is not
  // a row anyone can remove (Resume ends it) but it counts in the total.
  open: { start: number; ms: number } | null;
  totalMs: number;
}

// Every pause of a sleep, in time order, worked out from the stored stretches
// like every other number on the card.
export function listPauses(s: Sleep, now: number): PauseList {
  const rows: PauseRow[] = [];
  for (let i = 0; i < s.stretches.length - 1; i++) {
    rows.push({ index: i, start: s.stretches[i].end as number, end: s.stretches[i + 1].start });
  }
  const wake = lastStretch(s).end;
  const open =
    stateOf(s, now) === "paused" && wake != null ? { start: wake, ms: Math.max(0, now - wake) } : null;
  const totalMs = rows.reduce((t, r) => t + (r.end - r.start), 0) + (open?.ms ?? 0);
  return { rows, open, totalMs };
}

// "2 min", "1 h 5 min" — whole minutes, rounded down like the timer, and a
// pause of a few seconds (paused by mistake, resumed straight away) says so
// instead of "0 min".
export function pauseLength(ms: number): string {
  return ms < MIN ? "under 1 min" : durationLabel(Math.floor(ms / MIN) * MIN);
}

export const pauseCountLabel = (n: number): string => (n === 1 ? "1 pause" : `${n} pauses`);

// What the screen reader says for a Remove button.
export const removePauseLabel = (zone: Zone, p: PauseRow): string =>
  `Remove pause from ${zone.fmtTime(p.start)} to ${zone.fmtTime(p.end)}`;

// The confirm box's second line.
export const removePauseBody = (zone: Zone, p: PauseRow): string =>
  `${zone.fmtTime(p.start)} to ${zone.fmtTime(p.end)} (${pauseLength(p.end - p.start)}). That time will count as sleep again.`;

/* ---------- deleting a sleep ---------- */

// "3:46 pm" and "4:26 pm" -> "3:46 – 4:26 pm": one am/pm when both times share
// it, the way the Reports rows write a sleep's range.
export function joinTimes(from: string, to: string): string {
  const sameHalf = from.slice(-2) === to.slice(-2);
  return `${sameHalf ? from.slice(0, -3) : from} – ${to}`;
}

export interface SleepPrompt {
  title: string;
  body: string;
  confirmLabel: string;
}

// The confirm box for deleting a sleep: the same box as deleting a moment. A
// finished sleep is named by its times and the time asleep, so it is clear
// which one is going ("3:46 – 4:26 pm (40m). You can restore it from Recently
// Deleted."); one still going keeps the plain wording.
export function deleteSleepPrompt(s: Sleep, now: number, zone: Zone): SleepPrompt {
  if (stateOf(s, now) !== "finished") {
    return {
      title: "Delete this sleep?",
      body: "You can restore it from Recently Deleted in Timeline for 7 days.",
      confirmLabel: "Delete",
    };
  }
  const end = closedAtOf(s, now) ?? lastStretch(s).end ?? now;
  const range = joinTimes(zone.fmtTime(firstStart(s)), zone.fmtTime(end));
  return {
    title: "Delete this sleep?",
    body: `${range} (${formatMinutes(asleepMs(s, now) / MIN)}). You can restore it from Recently Deleted.`,
    confirmLabel: "Delete sleep",
  };
}

/* ---------- deleting several at once (Edit mode) ---------- */

// Edit mode keeps what is ticked in one set: moment keys, and sleeps by this
// key so the two can never be mistaken for each other (JOS-92).
export const sleepSelectKey = (id: string): string => `sleep:${id}`;

const countOf = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// The confirm box for Delete (n) in Edit mode: what is going, counted in the
// words of the moments' own box ("Delete 3 logged moments?") with sleeps beside
// them ("Delete 3 logged moments and 1 sleep?"), and a line when one of the
// sleeps is still going, since deleting it stops it too. Moments alone read
// exactly as they did before sleeps could be ticked.
export function bulkDeletePrompt(count: { moments: number; sleeps: number; going: number }): {
  title: string;
  body: string;
} {
  const parts: string[] = [];
  if (count.moments > 0) parts.push(countOf(count.moments, "logged moment", "logged moments"));
  if (count.sleeps > 0) parts.push(countOf(count.sleeps, "sleep", "sleeps"));
  const total = count.moments + count.sleeps;
  const restore = `You can restore ${total === 1 ? "it" : "them"} from Recently Deleted in Timeline for 7 days.`;
  return {
    title: `Delete ${parts.join(" and ")}?`,
    body: count.going > 0 ? `${restore} A sleep that is still going will be stopped.` : restore,
  };
}

// What to tell the user when some of the sleeps in a bulk delete did not go
// (someone else changed one first, a rule said no, the network dropped): the
// first answer's own words, led by a count when more than one stayed.
export function bulkSleepFailure(notDeleted: number, message: string | null): string {
  const first = message ?? "Couldn't delete that sleep.";
  return notDeleted === 1 ? first : `${notDeleted} sleeps weren't deleted. ${first}`;
}

// Why a restore from Recently Deleted was refused, in the restore's own words
// ("That overlaps ..." reads as if the user had picked a time). A restored
// sleep is always a finished one, so the only rule that can say no is the
// overlap check every sleep write goes through; a second running sleep is
// covered too, because that rule would refuse it.
export function describeRestoreRefusal(
  err: SleepError,
  zone: Zone,
  now: number,
  nameOf: (memberId: string | null) => string,
): string {
  if (err.code === "overlap") {
    const other = err.data.other;
    if (!other) return "This sleep can't be restored: it would overlap another sleep.";
    const end = other.closedAt ?? lastStretch(other).end ?? now;
    return `This sleep can't be restored: it would overlap the sleep from ${zone.fmtStamp(firstStart(other), now)} to ${zone.fmtStamp(end, now)}.`;
  }
  if (err.code === "already-open") {
    return "This sleep can't be restored: a sleep is already running.";
  }
  return describeSleepError(err, zone, now, nameOf);
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
  autoclose: "closed this sleep",
};

// What the database says when the times in an edit break a rule that the sheet
// should have caught first (the clock moved on, say): the sheet shows it under
// its buttons, since the field in question may no longer be on screen.
const TIMES_RULE: Record<EditRule, string> = {
  "needs-time": "A time is missing.",
  order: "Those times do not fit together: each stretch and each pause needs at least a minute.",
  "pause-overlap": "Two pauses overlap.",
  "pause-gap": "Leave at least 1 minute of sleep between two pauses.",
  "open-not-last": "Only the last pause can still be going.",
  "open-needs-end": "A pause is still going: give it an end time, or clear Sleep ended.",
};

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
    case "no-pause":
      return "That pause is not there any more.";
    case "times":
      return TIMES_RULE[d.rule ?? "order"];
    case "bad-time":
      return "That is not a valid time.";
    case "open":
    case "order":
    case "empty":
      return "Those times do not fit together.";
  }
}
