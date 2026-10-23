import { describe, expect, it } from "vitest";
import {
  AUTO_CLOSE_MS,
  HOUR,
  MIN,
  SleepError,
  isAutoClosed,
  stateOf,
  type Sleep,
  type SleepWorld,
} from "@/lib/sleep";
import {
  EDIT_AUTO_NOTE,
  addBlock,
  blockLabel,
  buildDraft,
  canSave,
  clockFrom12,
  clockTo12,
  editSleepTimes,
  editSummary,
  evaluateDraft,
  formatClock,
  fromModel,
  issuesByField,
  modelState,
  removeBlock,
  removedPauseLine,
  resolveField,
  savedLine,
  setClock,
  staleResult,
  staleWarning,
  toModel,
  undoRemoveBlock,
  validateModel,
  type Draft,
  type EditModel,
} from "@/lib/sleep-edit";
import { createZone } from "@/lib/sleep-format";

// All wall-clock times below are London on 21 Oct 2026 (BST, UTC+1) unless a
// day is given: the prototype's day, so its scenarios read the same here.
const zone = createZone("Europe/London");
const L = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h - 1, m);
const clock = (h: number, m = 0) => h * 60 + m;

let n = 0;
function sleep(
  stretches: Array<[number, number | null]>,
  over: Partial<Sleep> = {},
): Sleep {
  n += 1;
  return {
    id: `s${n}`,
    by: "joseph",
    stretches: stretches.map(([start, end]) => ({ start, end })),
    closedAt: null,
    rev: 1,
    last: { by: "joseph", action: "start", at: stretches[0][0] },
    notes: null,
    ...over,
  };
}
const finished = (
  stretches: Array<[number, number]>,
  over: Partial<Sleep> = {},
) =>
  sleep(stretches, { closedAt: stretches[stretches.length - 1][1], ...over });

const ctx = (now: number, others: Sleep[] = [], changed: string[] = []) => ({
  now,
  others,
  changed: new Set(changed),
  zone,
});
const p = (row: number, start: number, end: number | null, isNew = false) => ({
  row,
  isNew,
  start,
  end,
});
const msgs = (model: EditModel, c: ReturnType<typeof ctx>) =>
  validateModel(model, c).map((i) => `${i.field}: ${i.msg}`);

describe("12-hour clock times (never 24-hour)", () => {
  it("converts at the edges of the day: 12:00 am, 12:05 pm, 12:30 am", () => {
    expect(clockTo12(clock(0, 0))).toEqual({ hour: 12, minute: 0, half: "am" });
    expect(clockTo12(clock(0, 30))).toEqual({
      hour: 12,
      minute: 30,
      half: "am",
    });
    expect(clockTo12(clock(12, 5))).toEqual({
      hour: 12,
      minute: 5,
      half: "pm",
    });
    expect(clockTo12(clock(17, 40))).toEqual({
      hour: 5,
      minute: 40,
      half: "pm",
    });
    expect(clockTo12(clock(23, 59))).toEqual({
      hour: 11,
      minute: 59,
      half: "pm",
    });
    expect(clockTo12(clock(11, 59))).toEqual({
      hour: 11,
      minute: 59,
      half: "am",
    });
  });

  it("converts back, and the round trip holds for every minute of the day", () => {
    expect(clockFrom12(12, 0, "am")).toBe(0);
    expect(clockFrom12(12, 30, "am")).toBe(30);
    expect(clockFrom12(12, 5, "pm")).toBe(clock(12, 5));
    expect(clockFrom12(5, 40, "pm")).toBe(clock(17, 40));
    expect(clockFrom12(11, 59, "pm")).toBe(clock(23, 59));
    for (let m = 0; m < 1440; m++) {
      const t = clockTo12(m);
      expect(clockFrom12(t.hour, t.minute, t.half)).toBe(m);
    }
  });

  it("formats like the rest of the app: 5:40 pm, 12:30 am", () => {
    expect(formatClock(clock(17, 40))).toBe("5:40 pm");
    expect(formatClock(clock(0, 30))).toBe("12:30 am");
    expect(formatClock(clock(12, 0))).toBe("12:00 pm");
    expect(formatClock(clock(9, 5))).toBe("9:05 am");
    expect(formatClock(clock(13, 0))).not.toMatch(/13/);
  });
});

describe("toModel / fromModel: the sleep as a person reads it, and back", () => {
  const now = L(21, 20, 0);

  it("a running sleep: no end, no pauses", () => {
    const s = sleep([[L(21, 17, 40), null]]);
    expect(toModel(s, now)).toEqual({
      start: L(21, 17, 40),
      end: null,
      pauses: [],
    });
  });

  it("a running sleep with a pause: the pause is a gap between two stretches", () => {
    const s = sleep([
      [L(21, 17, 40), L(21, 18, 20)],
      [L(21, 18, 40), null],
    ]);
    const m = toModel(s, now);
    expect(m.end).toBeNull();
    expect(m.pauses).toEqual([p(0, L(21, 18, 20), L(21, 18, 40))]);
    expect(modelState(m)).toBe("asleep");
  });

  it("a paused sleep: the pause in progress is the last pause, with no end", () => {
    const s = sleep([
      [L(21, 17, 40), L(21, 18, 20)],
      [L(21, 18, 35), L(21, 19, 15)],
    ]);
    const m = toModel(s, now);
    expect(m.end).toBeNull();
    expect(m.pauses).toEqual([
      p(0, L(21, 18, 20), L(21, 18, 35)),
      p(1, L(21, 19, 15), null),
    ]);
    expect(modelState(m)).toBe("paused");
  });

  it("a finished sleep: the end is the close", () => {
    const s = finished([
      [L(20, 20, 0), L(20, 23, 5)],
      [L(20, 23, 25), L(21, 6, 40)],
    ]);
    const m = toModel(s, now);
    expect(m.end).toBe(L(21, 6, 40));
    expect(m.pauses).toEqual([p(0, L(20, 23, 5), L(20, 23, 25))]);
    expect(modelState(m)).toBe("finished");
  });

  it("round trips for running, paused and finished", () => {
    const cases = [
      sleep([[L(21, 17, 40), null]]),
      sleep([
        [L(21, 17, 40), L(21, 18, 20)],
        [L(21, 18, 40), null],
      ]),
      sleep([
        [L(21, 17, 40), L(21, 18, 20)],
        [L(21, 18, 35), L(21, 19, 15)],
      ]),
      finished([
        [L(20, 20, 0), L(20, 23, 5)],
        [L(20, 23, 25), L(21, 1, 50)],
        [L(21, 2, 10), L(21, 6, 40)],
      ]),
    ];
    for (const s of cases) {
      const out = fromModel(toModel(s, now));
      expect(out.stretches).toEqual(s.stretches);
      expect(out.closedAt).toBe(s.closedAt);
    }
  });

  it("puts the pauses in time order, whatever order they were given in", () => {
    const m: EditModel = {
      start: L(21, 8, 0),
      end: L(21, 11, 0),
      pauses: [
        p(1, L(21, 10, 0), L(21, 10, 10)),
        p(0, L(21, 9, 0), L(21, 9, 5)),
      ],
    };
    expect(fromModel(m).stretches).toEqual([
      { start: L(21, 8, 0), end: L(21, 9, 0) },
      { start: L(21, 9, 5), end: L(21, 10, 0) },
      { start: L(21, 10, 10), end: L(21, 11, 0) },
    ]);
  });

  it("clearing a finished sleep's Ended makes it run again, and makes no pause", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    const m = { ...toModel(s, now), end: null };
    const out = fromModel(m);
    expect(out.stretches).toEqual([{ start: L(21, 8, 0), end: null }]);
    expect(out.closedAt).toBeNull();
    expect(modelState(m)).toBe("asleep");
  });

  it("removing the only open pause of a paused sleep makes it run again", () => {
    const s = sleep([[L(21, 17, 40), L(21, 19, 15)]]);
    const m = toModel(s, now);
    expect(modelState(m)).toBe("paused");
    const without = { ...m, pauses: [] };
    expect(fromModel(without)).toEqual({
      stretches: [{ start: L(21, 17, 40), end: null }],
      closedAt: null,
    });
  });

  it("a finished sleep keeps its start and end when a pause is removed", () => {
    const s = finished([
      [L(21, 8, 0), L(21, 8, 30)],
      [L(21, 8, 40), L(21, 9, 30)],
    ]);
    const m = { ...toModel(s, now), pauses: [] };
    expect(fromModel(m)).toEqual({
      stretches: [{ start: L(21, 8, 0), end: L(21, 9, 30) }],
      closedAt: L(21, 9, 30),
    });
  });

  it("2 h boundary: 1 h 55 min paused is still a paused sleep with an open pause; 2 h is finished at the pause start", () => {
    const wake = L(21, 1, 0);
    const s = sleep([[L(20, 21, 0), wake]]);
    const at115 = toModel(s, wake + 115 * MIN);
    expect(modelState(at115)).toBe("paused");
    expect(at115.pauses).toEqual([p(0, wake, null)]);
    const at120 = toModel(s, wake + AUTO_CLOSE_MS);
    expect(at120.end).toBe(wake);
    expect(at120.pauses).toEqual([]);
    expect(modelState(at120)).toBe("finished");
    expect(isAutoClosed(s, wake + AUTO_CLOSE_MS)).toBe(true);
    expect(stateOf(s, wake + AUTO_CLOSE_MS - 1)).toBe("paused");
  });
});

describe("validateModel: every rule, with the spec's exact words", () => {
  const now = L(21, 20, 0);
  const base = (over: Partial<EditModel> = {}): EditModel => ({
    start: L(21, 17, 40),
    end: L(21, 19, 0),
    pauses: [],
    ...over,
  });

  it("is quiet for times that fit", () => {
    expect(
      validateModel(
        base({ pauses: [p(0, L(21, 18, 20), L(21, 18, 40))] }),
        ctx(now),
      ),
    ).toEqual([]);
  });

  it("nothing in the future", () => {
    expect(msgs(base({ end: now + MIN }), ctx(now))).toEqual([
      "se: Sleep ended can't be in the future.",
    ]);
    expect(msgs(base({ start: now + MIN, end: null }), ctx(now))).toContain(
      "ss: Sleep started can't be in the future.",
    );
    expect(
      msgs(base({ pauses: [p(0, L(21, 18, 0), now + MIN)] }), ctx(now)),
    ).toContain("p0e: Pause 1 ended can't be in the future.");
    expect(
      msgs(base({ pauses: [p(1, now + 5 * MIN, null, true)] }), ctx(now)),
    ).toContain("p1s: New pause started can't be in the future.");
    // exactly now is fine
    expect(validateModel(base({ end: now }), ctx(now))).toEqual([]);
  });

  it("sleep ended after started, at least a minute", () => {
    expect(msgs(base({ end: L(21, 17, 40) }), ctx(now))).toEqual([
      "se: Sleep ended must be after sleep started (5:40 pm).",
    ]);
    expect(msgs(base({ end: L(21, 17, 30) }), ctx(now))).toEqual([
      "se: Sleep ended must be after sleep started (5:40 pm).",
    ]);
    expect(msgs(base({ end: L(21, 17, 40) + 30_000 }), ctx(now))).toEqual([
      "se: Sleep ended must be at least 1 minute after sleep started (5:40 pm).",
    ]);
    expect(validateModel(base({ end: L(21, 17, 41) }), ctx(now))).toEqual([]);
  });

  it("puts the message on the field the person just changed", () => {
    const m = base({ start: L(21, 19, 30) });
    expect(msgs(m, ctx(now, [], ["ss"]))).toEqual([
      "ss: Sleep started must be before sleep ended (7:00 pm).",
    ]);
    expect(msgs(m, ctx(now, [], ["se"]))).toEqual([
      "se: Sleep ended must be after sleep started (7:30 pm).",
    ]);
    // neither changed: the later field
    expect(msgs(m, ctx(now))).toEqual([
      "se: Sleep ended must be after sleep started (7:30 pm).",
    ]);
  });

  it("each pause starts at least a minute after the sleep start and ends a minute before the sleep end", () => {
    expect(
      msgs(base({ pauses: [p(0, L(21, 17, 40), L(21, 17, 50))] }), ctx(now)),
    ).toEqual(["p0s: Pause 1 started must be after sleep started (5:40 pm)."]);
    expect(
      msgs(
        base({ pauses: [p(0, L(21, 17, 30), L(21, 17, 50))] }),
        ctx(now, [], ["ss"]),
      ),
    ).toEqual(["ss: Sleep started must be before pause 1 started (5:30 pm)."]);
    expect(
      msgs(base({ pauses: [p(0, L(21, 18, 50), L(21, 19, 0))] }), ctx(now)),
    ).toEqual(["se: Sleep ended must be after pause 1 ended (7:00 pm)."]);
    expect(
      msgs(
        base({ pauses: [p(0, L(21, 18, 50), L(21, 19, 0) - 30_000)] }),
        ctx(now),
      ),
    ).toContain(
      "se: Sleep ended must be at least 1 minute after pause 1 ended (6:59 pm).",
    );
  });

  it("every pause is at least a minute", () => {
    expect(
      msgs(base({ pauses: [p(0, L(21, 18, 20), L(21, 18, 20))] }), ctx(now)),
    ).toEqual(["p0e: Pause 1 ended must be after pause 1 started (6:20 pm)."]);
    expect(
      msgs(
        base({ pauses: [p(0, L(21, 18, 20), L(21, 18, 20) + 20_000)] }),
        ctx(now),
      ),
    ).toEqual([
      "p0e: Pause 1 ended must be at least 1 minute after pause 1 started (6:20 pm).",
    ]);
  });

  it("pauses never overlap, and new blocks are named in lower case in the middle of a sentence", () => {
    const two = base({
      pauses: [
        p(0, L(21, 18, 20), L(21, 18, 40)),
        p(1, L(21, 18, 30), L(21, 18, 50)),
      ],
    });
    expect(msgs(two, ctx(now))).toEqual([
      "p1s: Pause 2 overlaps Pause 1 (6:20 pm to 6:40 pm).",
    ]);
    const news = base({
      pauses: [
        p(0, L(21, 18, 20), L(21, 18, 40), true),
        p(1, L(21, 18, 30), L(21, 18, 50), true),
      ].map((x, i) => ({ ...x, label: `New pause ${i + 1}` })),
    });
    expect(msgs(news, ctx(now))).toEqual([
      "p1s: New pause 2 overlaps new pause 1 (6:20 pm to 6:40 pm).",
    ]);
  });

  it("overlap goes on the pause start unless only the other pause's end was changed", () => {
    const two = base({
      pauses: [
        p(0, L(21, 18, 20), L(21, 18, 40)),
        p(1, L(21, 18, 30), L(21, 18, 50)),
      ],
    });
    expect(msgs(two, ctx(now, [], ["p0e"]))[0]).toMatch(/^p0e: /);
    expect(msgs(two, ctx(now, [], ["p1s"]))[0]).toMatch(/^p1s: /);
  });

  it("at least a minute of sleep between two pauses", () => {
    const touching = base({
      pauses: [
        p(0, L(21, 18, 20), L(21, 18, 40)),
        p(1, L(21, 18, 40) + 30_000, L(21, 18, 50)),
      ],
    });
    expect(msgs(touching, ctx(now))).toEqual([
      "p1s: Leave at least 1 minute of sleep between Pause 1 and Pause 2.",
    ]);
    const exact = base({
      pauses: [
        p(0, L(21, 18, 20), L(21, 18, 40)),
        p(1, L(21, 18, 41), L(21, 18, 50)),
      ],
    });
    expect(validateModel(exact, ctx(now))).toEqual([]);
  });

  it("only the last pause can still be going", () => {
    const m = base({
      end: null,
      pauses: [p(0, L(21, 18, 0), null), p(1, L(21, 18, 30), L(21, 18, 40))],
    });
    expect(msgs(m, ctx(now))).toEqual([
      "p0e: Only the last pause can still be going.",
    ]);
  });

  it("a sleep with an end cannot have a pause still going", () => {
    const m = base({
      pauses: [p(0, L(21, 18, 0), L(21, 18, 10)), p(1, L(21, 18, 30), null)],
    });
    expect(msgs(m, ctx(now))).toEqual([
      "p1e: Pause 2 needs an end time, or clear Sleep ended.",
    ]);
  });

  it("no overlap with another sleep; touching is allowed", () => {
    const other = finished([[L(21, 9, 30), L(21, 10, 0)]]);
    const nap = (start: number, end: number): EditModel => ({
      start,
      end,
      pauses: [],
    });
    // starts inside the other: on Started
    expect(
      msgs(nap(L(21, 9, 45), L(21, 10, 30)), ctx(L(21, 12), [other])),
    ).toEqual(["ss: That overlaps the sleep from 9:30 am to 10:00 am."]);
    // starts before, ends inside: on Ended
    expect(
      msgs(nap(L(21, 9, 0), L(21, 9, 45)), ctx(L(21, 12), [other])),
    ).toEqual(["se: That overlaps the sleep from 9:30 am to 10:00 am."]);
    // swallows it: on Ended
    expect(
      msgs(nap(L(21, 9, 0), L(21, 10, 30)), ctx(L(21, 12), [other]))[0],
    ).toMatch(/^se: /);
    // touching either side is fine
    expect(
      validateModel(nap(L(21, 9, 0), L(21, 9, 30)), ctx(L(21, 12), [other])),
    ).toEqual([]);
    expect(
      validateModel(nap(L(21, 10, 0), L(21, 10, 30)), ctx(L(21, 12), [other])),
    ).toEqual([]);
  });

  it("a running sleep counts as another sleep, up to now", () => {
    const running = sleep([[L(21, 11, 0), null]]);
    const m: EditModel = { start: L(21, 9, 0), end: L(21, 11, 30), pauses: [] };
    expect(msgs(m, ctx(L(21, 12), [running]))).toEqual([
      "se: That overlaps the sleep from 11:00 am to 12:00 pm.",
    ]);
  });

  it("names a sleep from another day with its day, since the time alone would mislead", () => {
    const other = finished([[L(20, 20, 0), L(20, 23, 0)]]);
    const m: EditModel = { start: L(20, 22, 0), end: L(21, 6, 0), pauses: [] };
    expect(msgs(m, ctx(L(21, 8), [other]))).toEqual([
      "ss: That overlaps the sleep from Tue 20 Oct 8:00 pm to Tue 20 Oct 11:00 pm.",
    ]);
  });

  it("a sleep that sits in the middle of another sleep's pause is allowed, as it always was", () => {
    const night = finished([
      [L(21, 1, 0), L(21, 2, 0)],
      [L(21, 3, 0), L(21, 6, 0)],
    ]);
    const nap: EditModel = {
      start: L(21, 2, 10),
      end: L(21, 2, 50),
      pauses: [],
    };
    expect(validateModel(nap, ctx(L(21, 8), [night]))).toEqual([]);
  });

  it("a pause of this sleep only needs to keep this sleep's own stretches off the other sleep", () => {
    const other = finished([[L(21, 9, 30), L(21, 10, 0)]]);
    // this sleep 9:00 to 11:00 with a pause 9:20 to 10:10 would leave stretches
    // 9:00-9:20 and 10:10-11:00: no overlap with 9:30-10:00 at all.
    const m: EditModel = {
      start: L(21, 9, 0),
      end: L(21, 11, 0),
      pauses: [p(0, L(21, 9, 20), L(21, 10, 10))],
    };
    expect(validateModel(m, ctx(L(21, 12), [other]))).toEqual([]);
    // a pause that ends inside the other puts the stretch after it on the other
    const bad: EditModel = { ...m, pauses: [p(0, L(21, 9, 20), L(21, 9, 40))] };
    expect(msgs(bad, ctx(L(21, 12), [other]))[0]).toMatch(
      /^p0e: That overlaps the sleep from 9:30 am to 10:00 am\.$/,
    );
  });
});

describe("the draft: dates inferred from a time-only entry", () => {
  const now = L(21, 10, 5);

  it("an existing field takes the day that puts the new time nearest its old one", () => {
    const f = { id: "p0s", orig: L(21, 1, 50), clock: clock(2, 20) };
    expect(resolveField(f, null, zone)).toBe(L(21, 2, 20)); // stays on that morning
    // 11:50 pm is nearer the previous evening than the next one
    expect(resolveField({ ...f, clock: clock(23, 50) }, null, zone)).toBe(
      L(20, 23, 50),
    );
    // exactly half a day away goes to the day before
    expect(
      resolveField(
        { id: "x", orig: L(21, 12, 0), clock: clock(0, 0) },
        null,
        zone,
      ),
    ).toBe(L(21, 0, 0));
  });

  it("an unchanged clock keeps the exact stored instant, seconds and all", () => {
    const orig = L(21, 8, 0) + 23_456;
    expect(
      resolveField({ id: "ss", orig, clock: clock(8, 0) }, null, zone),
    ).toBe(orig);
  });

  it("a new field takes the first matching time at or after the field it follows", () => {
    const follows = L(20, 21, 0);
    expect(
      resolveField(
        { id: "p1s", orig: null, clock: clock(23, 10) },
        follows,
        zone,
      ),
    ).toBe(L(20, 23, 10));
    // earlier in the day than the sleep start: the next day
    expect(
      resolveField(
        { id: "p1s", orig: null, clock: clock(1, 0) },
        follows,
        zone,
      ),
    ).toBe(L(21, 1, 0));
    // the same minute is "at"
    expect(
      resolveField(
        { id: "p1s", orig: null, clock: clock(21, 0) },
        follows,
        zone,
      ),
    ).toBe(follows);
  });

  it("across midnight: a pause 11:50 pm to 12:10 am follows the sleep's day", () => {
    const d = buildDraft(finished([[L(20, 21, 0), L(21, 6, 0)]]), now, zone);
    let x = addBlock(d);
    x = setClock(x, "p0s", clock(23, 50));
    x = setClock(x, "p0e", clock(0, 10));
    const e = evaluateDraft(x, { now, others: [], zone });
    expect(e.ms.p0s).toBe(L(20, 23, 50));
    expect(e.ms.p0e).toBe(L(21, 0, 10));
    expect(e.issues).toEqual([]);
  });

  it("a time that cannot be placed after what it follows is left to the ordinary messages", () => {
    expect(
      resolveField({ id: "x", orig: null, clock: 5 }, null, zone),
    ).toBeNull();
    expect(
      resolveField({ id: "x", orig: null, clock: null }, 100, zone),
    ).toBeNull();
  });
});

describe("the draft: the sheet's whole flow", () => {
  const evalAt = (d: Draft, now: number, others: Sleep[] = []) =>
    evaluateDraft(d, { now, others, zone });

  it("opens with no blank pause block, and nothing to save", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    const d = buildDraft(s, L(21, 10, 5), zone);
    expect(d.blocks).toEqual([]);
    const e = evalAt(d, L(21, 10, 5));
    expect(e.issues).toEqual([]);
    expect(e.changed.size).toBe(0);
    expect(canSave(e)).toBe(false);
    expect(editSummary(e, L(21, 10, 5), zone)).toBe("");
  });

  it("acceptance 9: a nap stopped at 9:00 edited to end 9:45 is 1 h 45 min; add a pause 9:00 to 9:05 am for 1 h 40 min asleep, 1 pause", () => {
    const now = L(21, 10, 5);
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    let d = setClock(buildDraft(s, now, zone), "se", clock(9, 45));
    let e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect(canSave(e)).toBe(true);
    expect(editSummary(e, now, zone)).toBe(
      "Slept 1 h 45 min · 0 pauses · woke 9:45 am",
    );
    expect(fromModel(e.model as EditModel)).toEqual({
      stretches: [{ start: L(21, 8, 0), end: L(21, 9, 45) }],
      closedAt: L(21, 9, 45),
    });

    d = addBlock(d);
    d = setClock(d, "p0s", clock(9, 0));
    d = setClock(d, "p0e", clock(9, 5));
    e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect(editSummary(e, now, zone)).toBe(
      "Slept 1 h 40 min · 1 pause · woke 9:45 am",
    );
    expect(fromModel(e.model as EditModel).stretches).toEqual([
      { start: L(21, 8, 0), end: L(21, 9, 0) },
      { start: L(21, 9, 5), end: L(21, 9, 45) },
    ]);
  });

  it("acceptance 10: a sleep that closed itself at 1:00 am ends at 7:10 am with a new pause 1:00 to 1:30 am, dates following the sleep", () => {
    const now = L(21, 8, 0);
    const s = sleep([
      [L(20, 21, 0), L(20, 23, 10)],
      [L(20, 23, 25), L(21, 1, 0)],
    ]);
    expect(isAutoClosed(s, now)).toBe(true);
    let d = buildDraft(s, now, zone);
    expect(editSummary(evalAt(d, now), now, zone)).toBe("");
    d = setClock(d, "se", clock(7, 10));
    // the old end (1:00 am on the 21st) moves to 7:10 am the same morning
    expect(evalAt(d, now).ms.se).toBe(L(21, 7, 10));
    d = addBlock(d);
    d = setClock(d, "p1s", clock(1, 0));
    d = setClock(d, "p1e", clock(1, 30));
    const e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect(e.ms.p1s).toBe(L(21, 1, 0));
    expect(e.ms.p1e).toBe(L(21, 1, 30));
    expect(editSummary(e, now, zone)).toBe(
      "Slept 9 h 25 min · 2 pauses · woke 7:10 am",
    );
  });

  it("clearing a finished sleep's Ended and saving makes it run again", () => {
    const now = L(21, 10, 5);
    const d = setClock(
      buildDraft(finished([[L(21, 8, 0), L(21, 9, 0)]]), now, zone),
      "se",
      null,
    );
    const e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect(canSave(e)).toBe(true);
    expect(fromModel(e.model as EditModel).closedAt).toBeNull();
    expect(editSummary(e, now, zone)).toBe(
      "Asleep 2 h 5 min · 0 pauses · still sleeping",
    );
  });

  it("an open last pause reads as paused in the summary", () => {
    const now = L(21, 19, 30);
    const s = sleep([
      [L(21, 17, 40), L(21, 18, 20)],
      [L(21, 18, 35), L(21, 19, 15)],
    ]);
    let d = buildDraft(s, now, zone);
    d = setClock(d, "p1s", clock(19, 10));
    expect(editSummary(evalAt(d, now), now, zone)).toBe(
      "Asleep 1 h 15 min · 2 pauses · paused",
    );
  });

  it("new blocks are optional: empty ones are ignored on save, and several can be saved at once", () => {
    const now = L(21, 10, 5);
    const s = finished([[L(21, 6, 0), L(21, 9, 0)]]);
    let d = buildDraft(s, now, zone);
    d = addBlock(addBlock(addBlock(d)));
    expect(d.blocks.map((b) => blockLabel(d, b))).toEqual([
      "New pause 1",
      "New pause 2",
      "New pause 3",
    ]);
    d = setClock(setClock(d, "p0s", clock(7, 0)), "p0e", clock(7, 10));
    d = setClock(setClock(d, "p2s", clock(8, 0)), "p2e", clock(8, 20));
    const e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect((e.model as EditModel).pauses.map((x) => x.row)).toEqual([0, 2]);
    // only blank blocks: nothing changed, nothing to save
    const blank = addBlock(addBlock(buildDraft(s, now, zone)));
    expect(canSave(evalAt(blank, now))).toBe(false);
    expect(
      blockLabel(addBlock(buildDraft(s, now, zone)), {
        row: 0,
        isNew: true,
        removed: false,
      }),
    ).toBe("New pause");
  });

  it("a new block with an Ended but no Started is an error on Started", () => {
    const now = L(21, 10, 5);
    const d0 = addBlock(
      buildDraft(finished([[L(21, 6, 0), L(21, 9, 0)]]), now, zone),
    );
    const d = setClock(d0, "p0e", clock(7, 10));
    const by = issuesByField(evalAt(d, now).issues);
    expect(by.p0s).toBe("Fill in when the pause started first.");
    expect(canSave(evalAt(d, now))).toBe(false);
  });

  it("two new pauses that overlap are caught, and the one that was added later is blamed", () => {
    const now = L(21, 10, 5);
    let d = addBlock(
      addBlock(buildDraft(finished([[L(21, 6, 0), L(21, 9, 0)]]), now, zone)),
    );
    d = setClock(setClock(d, "p0s", clock(7, 0)), "p0e", clock(7, 30));
    d = setClock(setClock(d, "p1s", clock(7, 20)), "p1e", clock(7, 40));
    expect(evalAt(d, now).issues.map((i) => i.msg)).toEqual([
      "New pause 2 overlaps new pause 1 (7:00 am to 7:30 am).",
    ]);
  });

  it("Remove on a new block drops it; Remove pause on an existing one only marks it, and Undo brings it back", () => {
    const now = L(21, 10, 5);
    const s = finished([
      [L(21, 6, 0), L(21, 7, 0)],
      [L(21, 7, 10), L(21, 9, 0)],
    ]);
    let d = buildDraft(s, now, zone);
    const added = addBlock(d);
    expect(removeBlock(added, 1).blocks).toEqual(d.blocks);
    expect(removeBlock(added, 1).fields.map((f) => f.id)).toEqual(
      d.fields.map((f) => f.id),
    );

    d = removeBlock(d, 0);
    expect(d.blocks[0].removed).toBe(true);
    let e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect(canSave(e)).toBe(true);
    expect((e.model as EditModel).pauses).toEqual([]);
    expect(editSummary(e, now, zone)).toBe(
      "Slept 3 h · 0 pauses · woke 9:00 am",
    );
    // Undo: back to nothing changed
    d = undoRemoveBlock(d, 0);
    e = evalAt(d, now);
    expect(e.changed.size).toBe(0);
    expect(canSave(e)).toBe(false);
  });

  it("a removed pause no longer takes part in validation", () => {
    const now = L(21, 10, 5);
    // a pause tapped by mistake and resumed 20 seconds later
    const s = finished([
      [L(21, 6, 0), L(21, 7, 0)],
      [L(21, 7, 0) + 20_000, L(21, 9, 0)],
    ]);
    let d = buildDraft(s, now, zone);
    d = setClock(d, "se", clock(9, 30));
    expect(evalAt(d, now).issues.map((i) => i.field)).toEqual(["p0e"]);
    d = removeBlock(d, 0);
    expect(evalAt(d, now).issues).toEqual([]);
  });

  it("remove a pause, fix the sleep, then add a new pause, all in one save", () => {
    const now = L(21, 10, 5);
    const s = finished([
      [L(21, 6, 0), L(21, 7, 0)],
      [L(21, 7, 10), L(21, 9, 0)],
    ]);
    let d = removeBlock(buildDraft(s, now, zone), 0);
    d = setClock(d, "se", clock(9, 30));
    d = addBlock(d);
    d = setClock(setClock(d, "p1s", clock(8, 0)), "p1e", clock(8, 10));
    const e = evalAt(d, now);
    expect(e.issues).toEqual([]);
    expect(fromModel(e.model as EditModel).stretches).toEqual([
      { start: L(21, 6, 0), end: L(21, 8, 0) },
      { start: L(21, 8, 10), end: L(21, 9, 30) },
    ]);
  });

  it("an empty required field is 'Enter a time.'", () => {
    const now = L(21, 10, 5);
    const s = sleep([
      [L(21, 6, 0), L(21, 7, 0)],
      [L(21, 7, 10), L(21, 7, 50)],
    ]);
    let d = buildDraft(s, now, zone);
    d = setClock(d, "ss", null);
    d = setClock(d, "p0s", null);
    d = setClock(d, "p0e", null);
    const by = issuesByField(evalAt(d, now).issues);
    expect(by).toEqual({
      ss: "Enter a time.",
      p0s: "Enter a time.",
      p0e: "Enter a time.",
    });
    // the open pause's Ended may stay empty; the sleep's Ended may too
    const ok = buildDraft(s, now, zone);
    expect(evalAt(ok, now).issues).toEqual([]);
  });

  it("nothing is ever adjusted: a time in the future stays as entered and blocks", () => {
    const now = L(21, 10, 5);
    const d = setClock(
      buildDraft(finished([[L(21, 8, 0), L(21, 9, 0)]]), now, zone),
      "se",
      clock(10, 30),
    );
    const e = evalAt(d, now);
    expect(e.ms.se).toBe(L(21, 10, 30));
    expect(issuesByField(e.issues)).toEqual({
      se: "Sleep ended can't be in the future.",
    });
    expect(canSave(e)).toBe(false);
  });

  it("an overlap with a neighbouring sleep blocks; touching saves", () => {
    const now = L(21, 10, 30);
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    const next = finished([[L(21, 9, 30), L(21, 10, 0)]]);
    const blocked = setClock(buildDraft(s, now, zone), "se", clock(9, 45));
    expect(issuesByField(evalAt(blocked, now, [next]).issues)).toEqual({
      se: "That overlaps the sleep from 9:30 am to 10:00 am.",
    });
    const touching = setClock(buildDraft(s, now, zone), "se", clock(9, 30));
    expect(evalAt(touching, now, [next]).issues).toEqual([]);
  });
});

describe("the sheet's words", () => {
  it("pins the spec's strings", () => {
    expect(EDIT_AUTO_NOTE).toBe(
      "Closed automatically after 2 h paused. If he went back to sleep, tap Edit times.",
    );
    expect(removedPauseLine(zone, L(21, 18, 20), L(21, 18, 40), false)).toBe(
      "6:20 pm to 6:40 pm will be removed when you save.",
    );
    expect(removedPauseLine(zone, L(21, 19, 15), null, true)).toBe(
      "7:15 pm to now will be removed when you save.",
    );
    expect(staleWarning("Jen", L(21, 7, 42), zone)).toBe(
      "Jen changed this sleep at 7:42 am. If you save now you will be told, and the latest times will be shown.",
    );
    expect(staleResult("Jen", L(21, 7, 42), zone)).toBe(
      "Jen already changed this sleep (7:42 am). Nothing was saved. The latest times are shown: check them and save again.",
    );
    expect(savedLine(["Jen"])).toBe("Saved. Jen sees it live.");
    expect(savedLine(["Jen", "Sam"])).toBe("Saved. Jen and Sam see it live.");
    expect(savedLine([])).toBe("Saved.");
  });
});

describe("editSleepTimes: the write the SQL mirrors", () => {
  const NOW = L(21, 10, 5);
  const world = (sleeps: Sleep[], now = NOW): SleepWorld => ({ now, sleeps });
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof SleepError) return e.code;
      throw e;
    }
    return null;
  };

  it("saves the new times, bumps the rev and records who and when", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]], { rev: 3 });
    const m = { ...toModel(s, NOW), end: L(21, 9, 45) };
    const w = editSleepTimes(world([s]), "jen", s.id, m, 3);
    expect(w.sleeps[0].stretches).toEqual([
      { start: L(21, 8, 0), end: L(21, 9, 45) },
    ]);
    expect(w.sleeps[0].closedAt).toBe(L(21, 9, 45));
    expect(w.sleeps[0].rev).toBe(4);
    expect(w.sleeps[0].last).toEqual({ by: "jen", action: "edit", at: NOW });
  });

  it("stale path: a save on an old rev changes nothing and says who changed it, and when", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]], {
      rev: 5,
      last: { by: "jen", action: "edit", at: L(21, 7, 42) },
    });
    const m = { ...toModel(s, NOW), end: L(21, 9, 45) };
    let err: SleepError | null = null;
    try {
      editSleepTimes(world([s]), "joseph", s.id, m, 4);
    } catch (e) {
      err = e as SleepError;
    }
    expect(err?.code).toBe("stale");
    expect(err?.data).toEqual({ by: "jen", action: "edit", at: L(21, 7, 42) });
    expect(s.rev).toBe(5);
  });

  it("works on a sleep that closed itself, and closes it for good (no more 'app' mark)", () => {
    const s = sleep([[L(20, 21, 0), L(21, 1, 0)]], { rev: 2 });
    expect(isAutoClosed(s, NOW)).toBe(true);
    const m: EditModel = {
      start: L(20, 21, 0),
      end: L(21, 7, 10),
      pauses: [p(0, L(21, 1, 0), L(21, 1, 30))],
    };
    const w = editSleepTimes(world([s]), "joseph", s.id, m, 2);
    expect(w.sleeps[0].closedAt).toBe(L(21, 7, 10));
    expect(isAutoClosed(w.sleeps[0], NOW)).toBe(false);
    expect(w.sleeps[0].stretches).toEqual([
      { start: L(20, 21, 0), end: L(21, 1, 0) },
      { start: L(21, 1, 30), end: L(21, 7, 10) },
    ]);
  });

  it("an edit that leaves the sleep paused past 2 h is closed, so it never counts as open", () => {
    const s = finished([[L(21, 6, 0), L(21, 7, 0)]]);
    const m: EditModel = {
      start: L(21, 6, 0),
      end: null,
      pauses: [p(0, L(21, 7, 0), null)],
    };
    const w = editSleepTimes(world([s]), "joseph", s.id, m, 1);
    expect(w.sleeps[0].closedAt).toBe(L(21, 7, 0));
    expect(stateOf(w.sleeps[0], NOW)).toBe("finished");
  });

  it("clearing Ended brings a finished sleep back to running", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    const w = editSleepTimes(
      world([s]),
      "joseph",
      s.id,
      { ...toModel(s, NOW), end: null },
      1,
    );
    expect(w.sleeps[0].closedAt).toBeNull();
    expect(stateOf(w.sleeps[0], NOW)).toBe("asleep");
    expect(w.sleeps[0].stretches).toEqual([{ start: L(21, 8, 0), end: null }]);
  });

  it("refuses to bring a sleep back while another is going, and closes the one that closed itself first", () => {
    const old = finished([[L(21, 9, 0), L(21, 9, 30)]]);
    const going = sleep([[L(21, 8, 0), L(21, 8, 30)]]); // paused 1 h 35 min: still open
    expect(
      code(() =>
        editSleepTimes(
          world([old, going]),
          "joseph",
          old.id,
          { ...toModel(old, NOW), end: null },
          1,
        ),
      ),
    ).toBe("already-open");

    const selfClosed = sleep([[L(21, 5, 0), L(21, 5, 30)]]); // paused more than 2 h
    const w = editSleepTimes(
      world([old, selfClosed]),
      "joseph",
      old.id,
      { ...toModel(old, NOW), end: null },
      1,
    );
    expect(w.sleeps.find((x) => x.id === selfClosed.id)).toMatchObject({
      closedAt: L(21, 5, 30),
      rev: selfClosed.rev,
      last: { by: null, action: "autoclose", at: L(21, 5, 30) + AUTO_CLOSE_MS },
    });
    expect(stateOf(w.sleeps.find((x) => x.id === old.id) as Sleep, NOW)).toBe(
      "asleep",
    );
  });

  it("refuses what the rules refuse, with the rule", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    const at = (m: EditModel) => () =>
      editSleepTimes(world([s]), "joseph", s.id, m, 1);
    expect(code(at({ start: L(21, 8, 0), end: NOW + MIN, pauses: [] }))).toBe(
      "future",
    );
    expect(code(at({ start: L(21, 8, 0), end: L(21, 8, 0), pauses: [] }))).toBe(
      "times",
    );
    expect(
      code(
        at({
          start: L(21, 8, 0),
          end: L(21, 9, 0),
          pauses: [
            p(0, L(21, 8, 10), L(21, 8, 30)),
            p(1, L(21, 8, 20), L(21, 8, 40)),
          ],
        }),
      ),
    ).toBe("times");
    const other = finished([[L(21, 9, 30), L(21, 10, 0)]]);
    expect(
      code(() =>
        editSleepTimes(
          world([s, other]),
          "joseph",
          s.id,
          { start: L(21, 8, 0), end: L(21, 9, 45), pauses: [] },
          1,
        ),
      ),
    ).toBe("overlap");
  });

  it("leaves the world it was given untouched", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    const before = world([s]);
    const snapshot = JSON.stringify(before);
    editSleepTimes(
      before,
      "joseph",
      s.id,
      { ...toModel(s, NOW), end: L(21, 9, 30) },
      1,
    );
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("a gone sleep is gone", () => {
    const s = finished([[L(21, 8, 0), L(21, 9, 0)]]);
    expect(
      code(() => editSleepTimes(world([]), "joseph", s.id, toModel(s, NOW), 1)),
    ).toBe("gone");
  });
});

describe("a whole hour of constants", () => {
  it("AUTO_CLOSE_MS is 2 h and is the one place it is written", () => {
    expect(AUTO_CLOSE_MS).toBe(2 * HOUR);
  });
});
