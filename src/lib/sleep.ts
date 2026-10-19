// The rules for the Sleep tracker (JOS-56), ported from the v1.12 prototype's
// `SleepEngine` block. Pure functions on plain numbers (UTC milliseconds) — no
// DOM, no Supabase, no time zone — so they can be unit-tested exhaustively.
//
// Two places state these rules and they must agree:
//   - here: the derivations (the timer, which buttons are offered, what the
//     time picker greys out) are what the screens use; the write functions
//     (startSleep ... removeSleep) are the reference the SQL mirrors, and are
//     what the unit tests pin down — the screens themselves send the action
//     to the database instead of calling them;
//   - the `sleeps` migration's SQL functions, which are authoritative: every
//     write goes through them, using the server's clock. See
//     supabase/migrations/20261017000000_sleeps.sql, and
//     supabase/tests/sleeps.sql for the same scenarios run against it.
//
// The one idea that matters most: nothing here ever counts ticks. Elapsed
// time is always recomputed from the stored timestamps, so a phone that was
// locked for 95 minutes reads 01 h 35 m the instant it wakes, and two phones
// looking at the same sleep can never drift apart.

export const MIN = 60_000;
export const HOUR = 60 * MIN;

export const SLEEP_RULES = {
  // A sleep left paused this long closes itself, ending at its last wake.
  autoCloseMs: 3 * HOUR,
  // A finished sleep can be reopened (back to paused) this long after its
  // last wake — and only if no newer sleep exists.
  reopenMs: 3 * HOUR,
  // The shortest a stretch may be to pause it, and to move its start/wake.
  minStretchMs: MIN,
} as const;

export type SleepState = "asleep" | "paused" | "finished";

// What the last change to a sleep was — stored on the row so the *other*
// parent can be told "Jen already paused this sleep (6:08 pm)".
export type SleepAction =
  | "start"
  | "pause"
  | "resume"
  | "finish"
  | "reopen"
  | "edit"
  | "delete"
  | "restore";

// Which end of the sleep a time edit moves: the first stretch's start
// ("Started earlier?") or the last stretch's end ("Woke earlier?").
export type SleepField = "start" | "end";

// One uninterrupted stretch of sleep. Only the last one may be open (end
// null) — an open stretch counts up to "now".
export interface Stretch {
  start: number;
  end: number | null;
}

export interface Sleep {
  id: string;
  // Who started it — the who-pill on the card.
  by: string | null;
  stretches: Stretch[];
  // Null while open (asleep or paused). When set it always equals the last
  // stretch's end.
  closedAt: number | null;
  // +1 on every state change. Every write is conditional on the rev the user
  // was looking at — first write wins.
  rev: number;
  last: { by: string | null; action: SleepAction; at: number };
  notes: string | null;
}

export interface SleepWorld {
  now: number;
  // Live (not deleted) sleeps only.
  sleeps: Sleep[];
}

export type SleepErrorCode =
  | "gone" // the sleep was deleted
  | "stale" // someone else changed it first
  | "autoclosed" // it closed itself after 3 h paused
  | "already-open" // another sleep is running or paused
  | "future"
  | "short" // pause before a stretch is a minute old
  | "before-wake" // resume before the pause began
  | "inverted" // ends before it starts
  | "bad-time"
  | "open" // only the last stretch can still be running
  | "order" // a stretch starts before the previous one ends
  | "empty"
  | "overlap"
  | "before-prev" // start before the previous sleep ended
  | "after-end" // start after this sleep's first stretch ended
  | "before-start" // wake before this stretch began
  | "no-pause" // there is no completed pause at that position
  | "no-reopen";

export interface SleepErrorData {
  // 1-based stretch number, for per-stretch validation errors.
  n?: number;
  // `stale`: who changed it, how, and when.
  by?: string | null;
  action?: SleepAction;
  at?: number;
  // `overlap` / `already-open`: the other sleep.
  other?: Sleep;
  // `short` / `inverted`: when the stretch in question began.
  stretchStart?: number;
  // `before-prev` / `after-end` / `before-start` / `future`: the limit hit.
  limit?: number;
  // `no-reopen`
  reason?: ReopenBlock;
}

export class SleepError extends Error {
  readonly code: SleepErrorCode;
  readonly data: SleepErrorData;

  constructor(code: SleepErrorCode, data: SleepErrorData = {}) {
    super(code);
    this.name = "SleepError";
    this.code = code;
    this.data = data;
  }
}

/* ---------- derived values: always from stored timestamps ---------- */

export const lastStretch = (s: Sleep): Stretch => s.stretches[s.stretches.length - 1];
export const firstStart = (s: Sleep): number => s.stretches[0].start;
export const pausesOf = (s: Sleep): number => s.stretches.length - 1;

// asleep = last stretch open. paused = last stretch ended. finished = closed,
// or paused for more than 3 h (it closes itself — lazily, see isAutoClosed).
export function stateOf(s: Sleep, now: number): SleepState {
  if (s.closedAt != null) return "finished";
  const l = lastStretch(s);
  if (l.end == null) return "asleep";
  return now - l.end > SLEEP_RULES.autoCloseMs ? "finished" : "paused";
}

// Finished by the 3 h rule, but not yet written as closed. The database only
// writes closed_at when the next sleep starts, so this has to be derived.
export const isAutoClosed = (s: Sleep, now: number): boolean =>
  s.closedAt == null && stateOf(s, now) === "finished";

export function closedAtOf(s: Sleep, now: number): number | null {
  if (s.closedAt != null) return s.closedAt;
  return isAutoClosed(s, now) ? (lastStretch(s).end as number) : null;
}

// Sum of the stretches; a stretch with no end counts up to now.
export function asleepMs(s: Sleep, now: number): number {
  return s.stretches.reduce(
    (total, g) => total + Math.max(0, (g.end ?? now) - g.start),
    0,
  );
}

// First start to close (or to the last wake, or to now) — pauses included.
export function spanMs(s: Sleep, now: number): number {
  const l = lastStretch(s);
  const closed = closedAtOf(s, now);
  return Math.max(0, (closed ?? l.end ?? now) - firstStart(s));
}

// Whole sleep so far, not just the last stretch: Stop asks first only when
// there is nothing worth keeping yet.
export const underMinute = (s: Sleep, now: number): boolean =>
  asleepMs(s, now) < SLEEP_RULES.minStretchMs;

export const latestSleep = (sleeps: Sleep[]): Sleep | null =>
  sleeps.reduce<Sleep | null>(
    (best, s) => (best === null || firstStart(s) > firstStart(best) ? s : best),
    null,
  );

// The single running-or-paused sleep, if any (one per baby).
export const openSleep = (sleeps: Sleep[], now: number): Sleep | null =>
  sleeps.find((s) => stateOf(s, now) !== "finished") ?? null;

// Latest end among the other sleeps: nothing may start before this.
export function floorFor(world: SleepWorld, id: string | null): number {
  return world.sleeps
    .filter((o) => o.id !== id)
    .reduce((floor, o) => {
      const end = closedAtOf(o, world.now) ?? lastStretch(o).end;
      return end == null ? floor : Math.max(floor, end);
    }, -Infinity);
}

// When a sleep ended — its close, or its last wake, or (still going) its
// start. Home files a sleep under the day it ENDED: an overnight sleep (11 pm
// to 6 am) is this morning's, not yesterday's, so it stays on screen with its
// Reopen button instead of dropping into "yesterday's last 3" the moment the
// day's first feed is logged.
export function endedAt(s: Sleep, now: number): number {
  return closedAtOf(s, now) ?? lastStretch(s).end ?? firstStart(s);
}

// The moment Home files a sleep under: when it ended, or — while it is still
// going (running or paused) — now, so it always sits under Today. Where it
// sits within the day is its start (interleaveByTime), never this: a sleep
// reopened from earlier in the day stays where it was instead of jumping to
// the top.
export function filedAt(s: Sleep, now: number): number {
  return stateOf(s, now) === "finished" ? endedAt(s, now) : now;
}

// Merges two newest-first lists into one, newest first: how a day's moments
// and sleeps read as a single log. A tie puts the sleep first.
export function interleaveByTime<M extends { timestamp: string }>(
  moments: M[],
  sleeps: Sleep[],
): Array<{ kind: "moment"; moment: M } | { kind: "sleep"; sleep: Sleep }> {
  const out: Array<{ kind: "moment"; moment: M } | { kind: "sleep"; sleep: Sleep }> = [];
  let m = 0;
  let s = 0;
  while (m < moments.length || s < sleeps.length) {
    const takeSleep =
      s < sleeps.length &&
      (m >= moments.length || firstStart(sleeps[s]) >= Date.parse(moments[m].timestamp));
    if (takeSleep) out.push({ kind: "sleep", sleep: sleeps[s++] });
    else out.push({ kind: "moment", moment: moments[m++] });
  }
  return out;
}

export type ReopenBlock = "not-finished" | "autoclosed" | "newer" | "expired";

export function canReopen(
  world: SleepWorld,
  s: Sleep,
): { ok: true } | { ok: false; reason: ReopenBlock } {
  if (s.closedAt == null) {
    return {
      ok: false,
      reason: isAutoClosed(s, world.now) ? "autoclosed" : "not-finished",
    };
  }
  if (world.sleeps.some((o) => o.id !== s.id && firstStart(o) > firstStart(s))) {
    return { ok: false, reason: "newer" };
  }
  if (world.now - s.closedAt > SLEEP_RULES.reopenMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/* ---------- editing a time: what the picker allows ---------- */

// The window a picked time must fall in. Start: after the previous sleep
// ended, and at least a minute before this sleep's first stretch ends. Wake:
// at least a minute after the last stretch began, and not in the future.
export function pickBounds(
  world: SleepWorld,
  s: Sleep,
  field: SleepField,
): { lo: number; hi: number } {
  if (field === "start") {
    const firstEnd = s.stretches[0].end;
    return {
      lo: floorFor(world, s.id),
      hi: firstEnd != null ? firstEnd - SLEEP_RULES.minStretchMs : world.now,
    };
  }
  return { lo: lastStretch(s).start + SLEEP_RULES.minStretchMs, hi: world.now };
}

/* ---------- errors the other parent can cause ---------- */

export function staleError(world: SleepWorld, s: Sleep): SleepError {
  if (isAutoClosed(s, world.now)) {
    return new SleepError("autoclosed", {
      at: (lastStretch(s).end as number) + SLEEP_RULES.autoCloseMs,
    });
  }
  return new SleepError("stale", {
    by: s.last.by,
    action: s.last.action,
    at: s.last.at,
  });
}

/* ---------- the writes ---------- */
//
// Each returns a new world (never mutates). `baseRev` is the rev the user was
// looking at; when given and out of date, the write loses to whoever got
// there first. The database does exactly this with `WHERE rev = ...`.

function byId(world: SleepWorld, id: string): Sleep {
  const s = world.sleeps.find((x) => x.id === id);
  if (!s) throw new SleepError("gone");
  return s;
}

function checkRev(world: SleepWorld, s: Sleep, baseRev?: number) {
  if (baseRev !== undefined && s.rev !== baseRev) throw staleError(world, s);
}

function replace(world: SleepWorld, next: Sleep): SleepWorld {
  return { ...world, sleeps: world.sleeps.map((s) => (s.id === next.id ? next : s)) };
}

function touch(
  s: Sleep,
  who: string | null,
  action: SleepAction,
  at: number,
): Sleep {
  return { ...s, rev: s.rev + 1, last: { by: who, action, at } };
}

function withLastEnd(stretches: Stretch[], end: number): Stretch[] {
  return stretches.map((g, i) => (i === stretches.length - 1 ? { ...g, end } : g));
}

function overlapRange(other: Sleep, now: number) {
  return other.stretches.map((g) => ({ start: g.start, end: g.end ?? now }));
}

function validateStretches(
  world: SleepWorld,
  id: string | null,
  stretches: Stretch[],
) {
  const { now } = world;
  if (stretches.length === 0) throw new SleepError("empty");

  let prev = -Infinity;
  stretches.forEach((g, i) => {
    const n = i + 1;
    if (!Number.isFinite(g.start)) throw new SleepError("bad-time", { n });
    if (g.end != null && !Number.isFinite(g.end)) throw new SleepError("bad-time", { n });
    if (g.start > now) throw new SleepError("future", { n });
    if (g.end != null && g.end > now) throw new SleepError("future", { n });
    if (g.end == null && i !== stretches.length - 1) throw new SleepError("open", { n });
    if (g.end != null && g.end < g.start) throw new SleepError("inverted", { n });
    if (g.start < prev) throw new SleepError("order", { n });
    prev = g.end ?? now;
  });

  for (const other of world.sleeps) {
    if (other.id === id) continue;
    for (const a of stretches) {
      const aEnd = a.end ?? now;
      for (const b of overlapRange(other, now)) {
        if (a.start < b.end && b.start < aEnd) throw new SleepError("overlap", { other });
      }
    }
  }
}

export function startSleep(
  world: SleepWorld,
  who: string | null,
  at: number,
  id: string = crypto.randomUUID(),
): SleepWorld {
  if (at > world.now) throw new SleepError("future");
  const open = openSleep(world.sleeps, world.now);
  if (open) throw new SleepError("already-open", { other: open });

  const stretches: Stretch[] = [{ start: at, end: null }];
  validateStretches(world, null, stretches);

  // Close any sleep that has already auto-closed first, in the same step, so
  // "one open sleep" never blocks on a sleep that has in fact ended.
  const settled = world.sleeps.map((s) =>
    isAutoClosed(s, world.now) ? { ...s, closedAt: lastStretch(s).end } : s,
  );
  const sleep: Sleep = {
    id,
    by: who,
    stretches,
    closedAt: null,
    rev: 1,
    last: { by: who, action: "start", at },
    notes: null,
  };
  return { ...world, sleeps: [...settled, sleep] };
}

export function pauseSleep(
  world: SleepWorld,
  who: string | null,
  id: string,
  at: number,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  if (stateOf(s, world.now) !== "asleep") throw staleError(world, s);
  const l = lastStretch(s);
  if (at > world.now) throw new SleepError("future");
  if (at < l.start + SLEEP_RULES.minStretchMs) {
    throw new SleepError("short", { stretchStart: l.start });
  }
  return replace(world, touch({ ...s, stretches: withLastEnd(s.stretches, at) }, who, "pause", at));
}

export function resumeSleep(
  world: SleepWorld,
  who: string | null,
  id: string,
  at: number,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  if (stateOf(s, world.now) !== "paused") throw staleError(world, s);
  const l = lastStretch(s) as Stretch & { end: number };
  if (at > world.now) throw new SleepError("future");
  if (at < l.end) throw new SleepError("before-wake", { limit: l.end });
  const stretches = [...s.stretches, { start: at, end: null }];
  validateStretches(world, s.id, stretches);
  return replace(world, touch({ ...s, stretches }, who, "resume", at));
}

// Stop works at any time, by either parent. Paused: it closes at the last
// wake and `at` is ignored. Asleep: it closes at `at`. The "less than a
// minute" dialog is UI only (see underMinute) — it is not a rule here.
export function finishSleep(
  world: SleepWorld,
  who: string | null,
  id: string,
  at: number,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  const state = stateOf(s, world.now);
  if (state === "finished") throw staleError(world, s);
  const l = lastStretch(s);
  if (state === "paused") {
    const end = l.end as number;
    return replace(world, touch({ ...s, closedAt: end }, who, "finish", end));
  }
  if (at > world.now) throw new SleepError("future");
  if (at < l.start) throw new SleepError("inverted", { stretchStart: l.start });
  return replace(
    world,
    touch({ ...s, stretches: withLastEnd(s.stretches, at), closedAt: at }, who, "finish", at),
  );
}

// Reopen: a finished sleep goes back to paused, its last wake kept.
export function reopenSleep(
  world: SleepWorld,
  who: string | null,
  id: string,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  const check = canReopen(world, s);
  if (!check.ok) {
    throw stateOf(s, world.now) !== "finished"
      ? staleError(world, s)
      : new SleepError("no-reopen", { reason: check.reason });
  }
  return replace(
    world,
    touch({ ...s, closedAt: null }, who, "reopen", lastStretch(s).end as number),
  );
}

// "Started earlier?" moves the first stretch's start; "Woke earlier?" moves
// the last stretch's end. Only open sleeps — a finished card is read-only.
export function editSleepTime(
  world: SleepWorld,
  who: string | null,
  id: string,
  field: SleepField,
  at: number,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  const state = stateOf(s, world.now);
  if (state === "finished") throw staleError(world, s);
  // A wake time only exists once the sleep is paused ("Woke earlier?").
  if (field === "end" && state !== "paused") throw staleError(world, s);

  if (!Number.isFinite(at)) throw new SleepError("bad-time");
  if (at > world.now) throw new SleepError("future");
  const { lo, hi } = pickBounds(world, s, field);
  if (at < lo) {
    throw new SleepError(field === "start" ? "before-prev" : "before-start", { limit: lo });
  }
  if (at > hi) {
    throw new SleepError(field === "start" ? "after-end" : "future", {
      limit: field === "start" ? hi + SLEEP_RULES.minStretchMs : hi,
    });
  }

  const stretches = s.stretches.map((g, i) => {
    if (field === "start" && i === 0) return { ...g, start: at };
    if (field === "end" && i === s.stretches.length - 1) return { ...g, end: at };
    return g;
  });
  validateStretches(world, id, stretches);
  return replace(world, touch({ ...s, stretches }, who, "edit", world.now));
}

// Remove one completed pause (JOS-78). `index` is the 0-based number of the
// stretch BEFORE the pause, so 0 is the first pause. The stretch either side
// of it become one — the paused time counts as sleep — and the sleep's start
// and end do not move. Only while the sleep is open: a finished sleep is
// read-only (JOS-56), so removing means Reopen first. That also covers one
// that closed itself after 3 h paused: staleError says so. The pause still in
// progress (after the last stretch) is not a pause yet; Resume ends it.
export function removePause(
  world: SleepWorld,
  who: string | null,
  id: string,
  index: number,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  if (stateOf(s, world.now) === "finished") throw staleError(world, s);
  if (!Number.isInteger(index) || index < 0 || index > s.stretches.length - 2) {
    throw new SleepError("no-pause");
  }

  const stretches = [
    ...s.stretches.slice(0, index),
    { start: s.stretches[index].start, end: s.stretches[index + 1].end },
    ...s.stretches.slice(index + 2),
  ];
  validateStretches(world, id, stretches);
  return replace(world, touch({ ...s, stretches }, who, "edit", world.now));
}

// Soft delete. The server keeps the row (deleted_at) so Recently Deleted can
// restore it for 7 days; here, "live sleeps only", it simply leaves the list.
export function removeSleep(
  world: SleepWorld,
  _who: string | null,
  id: string,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  return { ...world, sleeps: world.sleeps.filter((x) => x.id !== id) };
}
