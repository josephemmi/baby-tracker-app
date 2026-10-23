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

// A sleep left paused this long closes itself, at the moment the pause began
// (JOS-103; it was 3 h). The one place the number lives on this side: the
// database has its own, `sleep_auto_close_after()` in the migration that made
// it 2 h, and the two must agree. Open to review after real use.
export const AUTO_CLOSE_MS = 2 * HOUR;

export const SLEEP_RULES = {
  autoCloseMs: AUTO_CLOSE_MS,
  // The shortest a stretch of sleep or a pause may be: to pause, and in every
  // time edit (JOS-103: one small rule, not separate numbers).
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
  | "restore"
  // The app closed it (paused for AUTO_CLOSE_MS), written when the next sleep
  // starts; until then the same fact is derived from the times (isAutoClosed).
  | "autoclose";

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
  | "autoclosed" // it closed itself after AUTO_CLOSE_MS paused
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
  | "no-pause" // there is no completed pause at that position
  | "times"; // Edit times: the set of times breaks a rule (data.rule says which)

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
  // `before-wake` and the like: the limit hit.
  limit?: number;
  // `times`: which rule, and the field it was found on ("ss", "se", "p0s"...;
  // see sleep-edit.ts).
  rule?: EditRule;
  field?: string;
}

// The rules an edit of times can break (sleep-edit.ts words them for the
// sheet; the database function answers with the same names).
export type EditRule =
  | "needs-time"
  | "order" // a time is not after the one before it, by at least a minute
  | "pause-overlap"
  | "pause-gap" // less than a minute of sleep between two pauses
  | "open-not-last" // only the last pause can still be going
  | "open-needs-end"; // a sleep with an end cannot have a pause still going


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
// or paused for AUTO_CLOSE_MS (it closes itself — lazily, see isAutoClosed).
export function stateOf(s: Sleep, now: number): SleepState {
  if (s.closedAt != null) return "finished";
  const l = lastStretch(s);
  if (l.end == null) return "asleep";
  return now - l.end >= SLEEP_RULES.autoCloseMs ? "finished" : "paused";
}

// Closed by the app, not by a person. Until the next sleep starts the database
// has not written closed_at, so it is derived from the times; after that the
// row says so itself (last action "autoclose"), and any person's edit
// replaces that action, which is what clears the card's note.
export const isAutoClosed = (s: Sleep, now: number): boolean =>
  s.closedAt == null ? stateOf(s, now) === "finished" : s.last.action === "autoclose";

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

// When a sleep ended — its close, or its last wake, or (still going) its
// start. Home files a sleep under the day it ENDED: an overnight sleep (11 pm
// to 6 am) is this morning's, not yesterday's, so it stays on screen with its
// Edit times button instead of dropping into "yesterday's last 3" the moment
// the day's first feed is logged.
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

/* ---------- errors the other parent can cause ---------- */

export function staleError(world: SleepWorld, s: Sleep): SleepError {
  if (isAutoClosed(s, world.now) && s.closedAt == null) {
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

export function byId(world: SleepWorld, id: string): Sleep {
  const s = world.sleeps.find((x) => x.id === id);
  if (!s) throw new SleepError("gone");
  return s;
}

export function checkRev(world: SleepWorld, s: Sleep, baseRev?: number) {
  if (baseRev !== undefined && s.rev !== baseRev) throw staleError(world, s);
}

export function replace(world: SleepWorld, next: Sleep): SleepWorld {
  return { ...world, sleeps: world.sleeps.map((s) => (s.id === next.id ? next : s)) };
}

export function touch(
  s: Sleep,
  who: string | null,
  action: SleepAction,
  at: number,
): Sleep {
  return { ...s, rev: s.rev + 1, last: { by: who, action, at } };
}

// An edit that leaves a sleep paused past AUTO_CLOSE_MS (or one that had
// closed itself) writes the close it would otherwise only derive, so the
// "one open sleep" rule never counts it and the app's mark is gone.
export function closeIfFinished(s: Sleep, now: number): Sleep {
  return s.closedAt == null && stateOf(s, now) === "finished"
    ? { ...s, closedAt: lastStretch(s).end }
    : s;
}

function withLastEnd(stretches: Stretch[], end: number): Stretch[] {
  return stretches.map((g, i) => (i === stretches.length - 1 ? { ...g, end } : g));
}

// Close any sleep that has already auto-closed, writing what was only derived:
// closed at its last wake, by the app, with no new rev (nothing a person would
// see changes). Start does it first, in the same step, so "one open sleep"
// never blocks on a sleep that has in fact ended; so does an edit that brings
// a finished sleep back to life.
export function settleAutoClosed(world: SleepWorld, exceptId?: string): Sleep[] {
  return world.sleeps.map((s) =>
    s.id !== exceptId && s.closedAt == null && isAutoClosed(s, world.now)
      ? {
          ...s,
          closedAt: lastStretch(s).end,
          last: {
            by: null,
            action: "autoclose" as const,
            at: (lastStretch(s).end as number) + SLEEP_RULES.autoCloseMs,
          },
        }
      : s,
  );
}

function overlapRange(other: Sleep, now: number) {
  return other.stretches.map((g) => ({ start: g.start, end: g.end ?? now }));
}

export function validateStretches(
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

  const closed = settleAutoClosed(world);
  const sleep: Sleep = {
    id,
    by: who,
    stretches,
    closedAt: null,
    rev: 1,
    last: { by: who, action: "start", at },
    notes: null,
  };
  return { ...world, sleeps: [...closed, sleep] };
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

// Remove one completed pause (JOS-78). `index` is the 0-based number of the
// stretch BEFORE the pause, so 0 is the first pause. The stretch either side
// of it become one — the paused time counts as sleep — and the sleep's start
// and end do not move. In every state since JOS-103 (a finished sleep is no
// longer read-only); one that closed itself stays closed, and the edit
// replaces its "closed by the app" mark. The pause still in progress (after
// the last stretch) is not a pause yet; Resume ends it.
export function removePause(
  world: SleepWorld,
  who: string | null,
  id: string,
  index: number,
  baseRev?: number,
): SleepWorld {
  const s = byId(world, id);
  checkRev(world, s, baseRev);
  if (!Number.isInteger(index) || index < 0 || index > s.stretches.length - 2) {
    throw new SleepError("no-pause");
  }

  const stretches = [
    ...s.stretches.slice(0, index),
    { start: s.stretches[index].start, end: s.stretches[index + 1].end },
    ...s.stretches.slice(index + 2),
  ];
  validateStretches(world, id, stretches);
  return replace(world, closeIfFinished(touch({ ...s, stretches }, who, "edit", world.now), world.now));
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
