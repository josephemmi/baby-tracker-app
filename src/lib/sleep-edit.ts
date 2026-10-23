// The rules behind the Edit times sheet (JOS-103), ported from the v1.15
// prototype's engine (`E.toModel`, `E.fromModel`, `E.validateModel`) and the
// parts of its sheet that decide things. Pure functions on UTC milliseconds
// and a Zone (for wall-clock times and wording) — no DOM, no Supabase — so
// every rule can be unit-tested. The sheet itself (edit-times-sheet.tsx) only
// draws what this returns.
//
// Two places state these rules and they must agree: here (what the sheet
// shows live, under the field) and the `edit_sleep_times` function in
// supabase/migrations/20261023000000_sleep_edit_times.sql (authoritative: it
// runs them again on write, with the server's clock, and the same overlap
// check against the household's other sleeps). The `editSleepTimes` write at
// the bottom is the reference the SQL mirrors, like the writes in sleep.ts.
//
// How a sleep is stored: one row, a list of STRETCHES of sleep
// [{start, end}...] (only the last may be open) and `closedAt`. A pause is
// the gap between two stretches, not a row of its own. The sheet works on a
// MODEL instead, the way a person reads it: { start, end, pauses[] }.
// `toModel` and `fromModel` convert, and the sheet never edits stretches.

import {
  SLEEP_RULES,
  SleepError,
  byId,
  closeIfFinished,
  closedAtOf,
  firstStart,
  lastStretch,
  openSleep,
  replace,
  settleAutoClosed,
  stateOf,
  touch,
  validateStretches,
  type EditRule,
  type Sleep,
  type SleepState,
  type SleepWorld,
  type Stretch,
} from "@/lib/sleep";
import {
  createZone,
  pauseCountLabel,
  pauseLength,
  type Zone,
} from "@/lib/sleep-format";

/* ---------- the model ---------- */

export interface EditPause {
  // The pause's place in the sheet, which is also what its field ids are built
  // from ("p0s", "p0e"): existing pauses 0..n-1 in time order, new blocks after.
  row: number;
  isNew: boolean;
  // How it is named in messages ("Pause 1", "New pause 2"); defaults to
  // "Pause <row + 1>" / "New pause".
  label?: string;
  start: number;
  // Null: the pause is still going (only the last may be).
  end: number | null;
}

export interface EditModel {
  start: number;
  // Null: the sleep is still going (or paused).
  end: number | null;
  pauses: EditPause[];
}

// Field ids: ss / se = sleep started / ended; p<row>s / p<row>e = a pause's.
export const sleepStartField = "ss";
export const sleepEndField = "se";
export const pauseStartField = (row: number) => `p${row}s`;
export const pauseEndField = (row: number) => `p${row}e`;

// The sleep as a person reads it. `now` decides whether a sleep paused for
// AUTO_CLOSE_MS is finished (it closed itself, at the pause start).
export function toModel(s: Sleep, now: number): EditModel {
  const state = stateOf(s, now);
  const model: EditModel = {
    start: firstStart(s),
    end: state === "finished" ? closedAtOf(s, now) : null,
    pauses: [],
  };
  for (let i = 0; i < s.stretches.length - 1; i++) {
    model.pauses.push({
      row: i,
      isNew: false,
      start: s.stretches[i].end as number,
      end: s.stretches[i + 1].start,
    });
  }
  if (state === "paused") {
    model.pauses.push({
      row: s.stretches.length - 1,
      isNew: false,
      start: lastStretch(s).end as number,
      end: null,
    });
  }
  return model;
}

const byStart = (a: EditPause, b: EditPause) => a.start - b.start;

interface ModelStretch {
  start: number;
  end: number | null;
  // The fields the two ends are read from: what a conflict is blamed on.
  startField: string;
  endField: string | null;
}

// The stretches of sleep a model comes to: the pauses in time order, the
// sleep between them. An open pause (still going) ends the list.
function modelStretches(model: EditModel): ModelStretch[] {
  const out: ModelStretch[] = [];
  let from = model.start;
  let fromField = sleepStartField;
  for (const p of [...model.pauses].sort(byStart)) {
    out.push({
      start: from,
      end: p.start,
      startField: fromField,
      endField: pauseStartField(p.row),
    });
    if (p.end == null) return out;
    from = p.end;
    fromField = pauseEndField(p.row);
  }
  out.push({
    start: from,
    end: model.end,
    startField: fromField,
    endField: model.end != null ? sleepEndField : null,
  });
  return out;
}

// Back to how it is stored. A set end = finished; no end and no open pause =
// running; an open pause = paused. Clearing a finished sleep's end and saving
// is how it is brought back: no pause is made, the old wake time is dropped.
export function fromModel(model: EditModel): {
  stretches: Stretch[];
  closedAt: number | null;
} {
  return {
    stretches: modelStretches(model).map(({ start, end }) => ({ start, end })),
    closedAt: model.end,
  };
}

export function modelState(model: EditModel): SleepState {
  if (model.end != null) return "finished";
  return model.pauses.some((p) => p.end == null) ? "paused" : "asleep";
}

/* ---------- 12-hour clock times ---------- */

export type Half = "am" | "pm";

// Minutes since midnight (0-1439) <-> the wheel's three columns. 12:00 am is
// 0, 12:05 pm is 725.
export function clockTo12(minutes: number): {
  hour: number;
  minute: number;
  half: Half;
} {
  const h = Math.floor(minutes / 60) % 24;
  return {
    hour: h % 12 || 12,
    minute: minutes % 60,
    half: h < 12 ? "am" : "pm",
  };
}

export function clockFrom12(hour: number, minute: number, half: Half): number {
  return ((hour % 12) + (half === "pm" ? 12 : 0)) * 60 + minute;
}

// "5:40 pm", "12:30 am": 12-hour whatever the phone is set to.
export function formatClock(minutes: number): string {
  const { hour, minute, half } = clockTo12(minutes);
  return `${hour}:${String(minute).padStart(2, "0")} ${half}`;
}

/* ---------- the rules ---------- */

export interface EditIssue {
  field: string;
  msg: string;
  rule: EditRule | "future" | "overlap" | "sleep-ended-first";
  // `overlap`: the other sleep.
  other?: Sleep;
}

export interface EditContext {
  now: number;
  // The household's other live sleeps: a running one is included, touching is
  // fine.
  others: Sleep[];
  // The fields the person changed: when a pair of times conflicts, the message
  // goes on the one they just changed.
  changed: ReadonlySet<string>;
  zone: Pick<Zone, "fmtTime" | "fmtStamp">;
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// The rules for any set of times. Empty means the write is allowed. Messages
// are the spec's, word for word; nothing is ever adjusted for the person.
export function validateModel(model: EditModel, ctx: EditContext): EditIssue[] {
  const { now, others, changed, zone } = ctx;
  const { fmtTime } = zone;
  const issues: EditIssue[] = [];
  const add = (
    field: string,
    msg: string,
    rule: EditIssue["rule"],
    other?: Sleep,
  ) => issues.push({ field, msg, rule, other });

  const nm = (p: EditPause) =>
    p.label || (p.isNew ? "New pause" : `Pause ${p.row + 1}`);
  const mid = (p: EditPause) => (p.isNew ? lc(nm(p)) : nm(p));

  interface F {
    id: string;
    label: string;
    ms: number | null;
  }
  const F: F[] = [
    { id: sleepStartField, label: "Sleep started", ms: model.start },
    { id: sleepEndField, label: "Sleep ended", ms: model.end },
  ];
  for (const p of model.pauses) {
    F.push({
      id: pauseStartField(p.row),
      label: `${nm(p)} started`,
      ms: p.start,
    });
    F.push({ id: pauseEndField(p.row), label: `${nm(p)} ended`, ms: p.end });
  }
  const by = (id: string) => F.find((x) => x.id === id);

  for (const x of F) {
    if (x.ms != null && x.ms > now)
      add(x.id, `${x.label} can't be in the future.`, "future");
  }

  // `a` before `b`, with at least a minute between them (a stretch of sleep
  // and a pause are never shorter).
  const pair = (aId: string, bId: string) => {
    const A = by(aId);
    const B = by(bId);
    if (
      !A ||
      !B ||
      A.ms == null ||
      B.ms == null ||
      B.ms - A.ms >= SLEEP_RULES.minStretchMs
    )
      return;
    const late = B.ms <= A.ms;
    if (changed.has(bId) || !changed.has(aId)) {
      add(
        bId,
        `${B.label}${late ? " must be after " : " must be at least 1 minute after "}${lc(A.label)} (${fmtTime(A.ms)}).`,
        "order",
      );
    } else {
      add(
        aId,
        `${A.label}${late ? " must be before " : " must be at least 1 minute before "}${lc(B.label)} (${fmtTime(B.ms)}).`,
        "order",
      );
    }
  };
  pair(sleepStartField, sleepEndField);
  for (const p of model.pauses) {
    pair(sleepStartField, pauseStartField(p.row));
    pair(pauseStartField(p.row), pauseEndField(p.row));
    pair(pauseEndField(p.row), sleepEndField);
    if (p.end == null && model.end != null) {
      add(
        pauseEndField(p.row),
        `${nm(p)} needs an end time, or clear Sleep ended.`,
        "open-needs-end",
      );
    }
  }

  // Pauses never overlap each other, and only the last one can still be going.
  const sorted = [...model.pauses].sort(byStart);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const P = sorted[i];
    const Q = sorted[i + 1];
    if (P.end == null) {
      add(
        pauseEndField(P.row),
        "Only the last pause can still be going.",
        "open-not-last",
      );
      continue;
    }
    const f =
      changed.has(pauseStartField(Q.row)) || !changed.has(pauseEndField(P.row))
        ? pauseStartField(Q.row)
        : pauseEndField(P.row);
    if (Q.start < P.end) {
      add(
        f,
        `${nm(Q)} overlaps ${mid(P)} (${fmtTime(P.start)} to ${fmtTime(P.end)}).`,
        "pause-overlap",
      );
    } else if (Q.start - P.end < SLEEP_RULES.minStretchMs) {
      add(
        f,
        `Leave at least 1 minute of sleep between ${mid(P)} and ${mid(Q)}.`,
        "pause-gap",
      );
    }
  }

  // Never overlap another sleep, a running one included; touching is fine.
  // Stretch against stretch, like the database's check, so a sleep that sits in
  // the middle of another one's pause is as allowed as it always was. The
  // message names the other sleep as a whole and goes on the field that puts
  // the sleep there: the start if it falls inside the other sleep, else the
  // end.
  const mine = modelStretches(model);
  for (const o of others) {
    const oStretches = o.stretches.map((g) => ({
      start: g.start,
      end: g.end ?? now,
    }));
    const oSpan = {
      start: firstStart(o),
      end: closedAtOf(o, now) ?? lastStretch(o).end ?? now,
    };
    for (const g of mine) {
      const gEnd = g.end ?? Math.max(now, g.start);
      const hit = oStretches.find((b) => g.start < b.end && b.start < gEnd);
      if (!hit) continue;
      const startInside = g.start > hit.start && g.start < hit.end;
      const field =
        startInside || g.endField == null ? g.startField : g.endField;
      add(
        field,
        `That overlaps the sleep from ${zone.fmtStamp(oSpan.start, now)} to ${zone.fmtStamp(oSpan.end, now)}.`,
        "overlap",
        o,
      );
      break;
    }
  }
  return issues;
}

/* ---------- the sheet's draft: times typed as a clock, dates inferred ---------- */

// Every field of the sheet. `orig` is what the sleep has (null: nothing yet);
// `clock` is what the person has entered, as minutes since local midnight
// (null: empty). The date is never entered; see resolveField.
export interface DraftField {
  id: string;
  orig: number | null;
  clock: number | null;
}

export interface DraftBlock {
  row: number;
  isNew: boolean;
  // An existing pause marked to go when the sheet is saved.
  removed: boolean;
}

export interface Draft {
  fields: DraftField[];
  blocks: DraftBlock[];
  // The next row a new block takes.
  next: number;
}

// Opens on the sleep as it is: no blank pause block (+ Add a pause adds one).
export function buildDraft(
  s: Sleep,
  now: number,
  zone: Pick<Zone, "clockOf">,
): Draft {
  const model = toModel(s, now);
  const field = (id: string, orig: number | null): DraftField => ({
    id,
    orig,
    clock: orig == null ? null : zone.clockOf(orig),
  });
  const fields = [
    field(sleepStartField, model.start),
    field(sleepEndField, model.end),
  ];
  const blocks: DraftBlock[] = [];
  for (const p of model.pauses) {
    fields.push(
      field(pauseStartField(p.row), p.start),
      field(pauseEndField(p.row), p.end),
    );
    blocks.push({ row: p.row, isNew: false, removed: false });
  }
  return { fields, blocks, next: model.pauses.length };
}

export const setClock = (
  d: Draft,
  id: string,
  clock: number | null,
): Draft => ({
  ...d,
  fields: d.fields.map((f) => (f.id === id ? { ...f, clock } : f)),
});

export function addBlock(d: Draft): Draft {
  const row = d.next;
  return {
    fields: [
      ...d.fields,
      { id: pauseStartField(row), orig: null, clock: null },
      { id: pauseEndField(row), orig: null, clock: null },
    ],
    blocks: [...d.blocks, { row, isNew: true, removed: false }],
    next: row + 1,
  };
}

// A new block is dropped on the spot (it was never saved); an existing pause is
// only marked, and Undo takes the mark off.
export function removeBlock(d: Draft, row: number): Draft {
  const block = d.blocks.find((b) => b.row === row);
  if (!block) return d;
  if (!block.isNew) {
    return {
      ...d,
      blocks: d.blocks.map((b) =>
        b.row === row ? { ...b, removed: true } : b,
      ),
    };
  }
  return {
    ...d,
    fields: d.fields.filter(
      (f) => f.id !== pauseStartField(row) && f.id !== pauseEndField(row),
    ),
    blocks: d.blocks.filter((b) => b.row !== row),
  };
}

export const undoRemoveBlock = (d: Draft, row: number): Draft => ({
  ...d,
  blocks: d.blocks.map((b) => (b.row === row ? { ...b, removed: false } : b)),
});

// "Pause 1" for an existing pause, "New pause" (or "New pause 1", "New pause 2"
// when there is more than one) for a block the person added.
export function blockLabel(d: Draft, block: DraftBlock): string {
  if (!block.isNew) return `Pause ${block.row + 1}`;
  const news = d.blocks.filter((b) => b.isNew);
  return news.length > 1 ? `New pause ${news.indexOf(block) + 1}` : "New pause";
}

// A time-only entry becomes an instant. A field that already has a time takes
// the day that puts the new time NEAREST to the old one (within half a day
// either side), so 1:50 am moved to 2:20 am stays on that morning. A new field
// (a new pause, a cleared Ended) takes the first matching time at or after the
// field it follows, searching up to two days on.
export function resolveField(
  f: DraftField,
  follows: number | null,
  zone: Pick<Zone, "clockOf" | "atClock">,
): number | null {
  if (f.clock == null) return null;
  if (f.orig != null) {
    if (zone.clockOf(f.orig) === f.clock) return f.orig;
    let best = zone.atClock(f.orig, 0, f.clock);
    for (const dd of [-1, 1]) {
      const c = zone.atClock(f.orig, dd, f.clock);
      if (Math.abs(c - f.orig) < Math.abs(best - f.orig)) best = c;
    }
    return best;
  }
  if (follows == null) return null;
  for (let dd = 0; dd <= 2; dd++) {
    const c = zone.atClock(follows, dd, f.clock);
    if (c >= follows) return c;
  }
  return null;
}

export interface Evaluation {
  issues: EditIssue[];
  // Fields whose time differs from what the sleep has (a removed pause counts
  // as its start changing).
  changed: Set<string>;
  // Each field's instant (absent for the fields of a removed block).
  ms: Record<string, number | null>;
  // Null while a field is missing; otherwise what would be saved.
  model: EditModel | null;
}

export interface EvaluateContext {
  now: number;
  others: Sleep[];
  zone: Zone;
}

// Everything the sheet shows and decides, from the draft alone.
export function evaluateDraft(d: Draft, ctx: EvaluateContext): Evaluation {
  const { now, others, zone } = ctx;
  const F: Record<string, DraftField> = {};
  for (const f of d.fields) F[f.id] = f;
  const ms: Record<string, number | null> = {};
  const changed = new Set<string>();
  const issues: EditIssue[] = [];

  ms[sleepStartField] = resolveField(F[sleepStartField], null, zone);
  ms[sleepEndField] = resolveField(F[sleepEndField], ms[sleepStartField], zone);
  for (const b of d.blocks) {
    const s = pauseStartField(b.row);
    const e = pauseEndField(b.row);
    if (b.removed) {
      changed.add(s);
      continue;
    }
    ms[s] = resolveField(F[s], ms[sleepStartField], zone);
    ms[e] = resolveField(
      F[e],
      ms[s] != null ? ms[s] : ms[sleepStartField],
      zone,
    );
  }
  for (const f of d.fields) {
    if (f.id in ms && ms[f.id] !== f.orig) changed.add(f.id);
  }

  if (ms[sleepStartField] == null) {
    issues.push({
      field: sleepStartField,
      msg: "Enter a time.",
      rule: "needs-time",
    });
  }
  for (const b of d.blocks) {
    if (b.removed) continue;
    const s = pauseStartField(b.row);
    const e = pauseEndField(b.row);
    if (!b.isNew) {
      if (ms[s] == null)
        issues.push({ field: s, msg: "Enter a time.", rule: "needs-time" });
      if (ms[e] == null && F[e].orig != null) {
        issues.push({ field: e, msg: "Enter a time.", rule: "needs-time" });
      }
    } else if (ms[s] == null && ms[e] != null) {
      issues.push({
        field: s,
        msg: "Fill in when the pause started first.",
        rule: "needs-time",
      });
    }
  }
  if (issues.length) return { issues, changed, ms, model: null };

  const pauses: EditPause[] = [];
  for (const b of d.blocks) {
    if (b.removed) continue;
    const s = pauseStartField(b.row);
    const e = pauseEndField(b.row);
    if (b.isNew && ms[s] == null) continue; // a blank new block is ignored
    pauses.push({
      row: b.row,
      isNew: b.isNew,
      label: blockLabel(d, b),
      start: ms[s] as number,
      end: ms[e],
    });
  }
  const model: EditModel = {
    start: ms[sleepStartField] as number,
    end: ms[sleepEndField],
    pauses,
  };
  return {
    issues: validateModel(model, { now, others, changed, zone }),
    changed,
    ms,
    model,
  };
}

// The first message of each field, which is what the sheet shows under it.
export function issuesByField(issues: EditIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) if (!(i.field in out)) out[i.field] = i.msg;
  return out;
}

// Save is allowed when something changed and nothing is wrong.
export const canSave = (e: Evaluation): boolean =>
  e.issues.length === 0 && e.changed.size > 0;

// "Slept 9 h 25 min · 2 pauses · woke 7:10 am" / "Asleep 1 h 50 min · 0 pauses
// · still sleeping" / "... · paused": shown once something changed and the
// times are valid.
export function editSummary(
  e: Evaluation,
  now: number,
  zone: Pick<Zone, "fmtTime">,
): string {
  if (e.issues.length || !e.changed.size || !e.model) return "";
  const out = fromModel(e.model);
  const asleep = out.stretches.reduce(
    (t, g) => t + Math.max(0, (g.end ?? now) - g.start),
    0,
  );
  const state = modelState(e.model);
  const tail =
    state === "finished"
      ? ` · woke ${zone.fmtTime(e.model.end as number)}`
      : state === "paused"
        ? " · paused"
        : " · still sleeping";
  return `${state === "finished" ? "Slept" : "Asleep"} ${pauseLength(asleep)} · ${pauseCountLabel(e.model.pauses.length)}${tail}`;
}

/* ---------- the words ---------- */

export const EDIT_TITLE = "Edit times";
export const EDIT_HELP =
  "Tap a time to change it. The date follows the sleep. Nothing saves until you tap Save.";
export const EDIT_SAVE = "Save times";
export const EDIT_END_HINT = "Leave empty while he is still asleep";
export const EDIT_OPEN_PAUSE_HINT = "Leave empty while it is still going";
export const EDIT_NOT_SET = "Not set";
export const EDIT_AUTO_NOTE = `Closed automatically after ${SLEEP_RULES.autoCloseMs / 3_600_000} h paused. If he went back to sleep, tap Edit times.`;

// The line under a removed pause's title.
export function removedPauseLine(
  zone: Pick<Zone, "fmtTime">,
  start: number | null,
  end: number | null,
  ongoing: boolean,
): string {
  const from = start == null ? "" : zone.fmtTime(start);
  return `${from} to ${ongoing || end == null ? "now" : zone.fmtTime(end)} will be removed when you save.`;
}

// While the sheet is open the other parent changes the sleep.
export function staleWarning(
  by: string,
  at: number,
  zone: Pick<Zone, "fmtTime">,
): string {
  return `${by} changed this sleep at ${zone.fmtTime(at)}. If you save now you will be told, and the latest times will be shown.`;
}

// Save lost to that change: nothing was saved and the latest times are shown.
export function staleResult(
  by: string,
  at: number,
  zone: Pick<Zone, "fmtTime">,
): string {
  return `${by} already changed this sleep (${zone.fmtTime(at)}). Nothing was saved. The latest times are shown: check them and save again.`;
}

// "Saved. Jen sees it live." / "Saved." when nobody else is in the household.
export function savedLine(otherNames: string[]): string {
  if (otherNames.length === 0) return "Saved.";
  const names =
    otherNames.length === 1
      ? otherNames[0]
      : `${otherNames.slice(0, -1).join(", ")} and ${otherNames[otherNames.length - 1]}`;
  return `Saved. ${names} ${otherNames.length === 1 ? "sees" : "see"} it live.`;
}

/* ---------- the write (reference for the SQL) ---------- */

// Edit times: replaces the sleep's times with a model's, in any state. First
// write wins on `baseRev` (the rev the sheet opened on): a stale save changes
// nothing. The rules are validateModel's plus the ones every sleep write has
// (validateStretches), and a sleep brought back to life needs the baby to have
// no other sleep going. Returns a new world.
export function editSleepTimes(
  world: SleepWorld,
  who: string | null,
  id: string,
  model: EditModel,
  baseRev: number,
  zone: Pick<Zone, "fmtTime" | "fmtStamp"> = createZone("UTC"),
): SleepWorld {
  const s = byId(world, id);
  if (s.rev !== baseRev) {
    throw new SleepError("stale", {
      by: s.last.by,
      action: s.last.action,
      at: s.last.at,
    });
  }
  const others = world.sleeps.filter((o) => o.id !== id);
  for (const p of model.pauses) {
    if (!Number.isFinite(p.start))
      throw new SleepError("bad-time", { rule: "needs-time" });
  }
  const issue = validateModel(model, {
    now: world.now,
    others,
    changed: new Set(),
    zone,
  })[0];
  if (issue) {
    if (issue.rule === "future")
      throw new SleepError("future", { field: issue.field });
    if (issue.rule === "overlap")
      throw new SleepError("overlap", { other: issue.other });
    throw new SleepError("times", {
      rule: issue.rule as EditRule,
      field: issue.field,
    });
  }

  const { stretches, closedAt } = fromModel(model);
  validateStretches(world, id, stretches);

  const settledWorld = { ...world, sleeps: settleAutoClosed(world, id) };
  const next: Sleep = closeIfFinished(
    touch({ ...s, stretches, closedAt }, who, "edit", world.now),
    world.now,
  );
  if (next.closedAt == null) {
    const open = openSleep(
      settledWorld.sleeps.filter((o) => o.id !== id),
      world.now,
    );
    if (open) throw new SleepError("already-open", { other: open });
  }
  return replace(settledWorld, next);
}
