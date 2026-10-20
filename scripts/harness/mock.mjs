// The prototype's mock data generator, verbatim in logic (sleep-reports-prototype.html), so the app and the
// prototype can be fed identical sleeps. Run with TZ=Europe/London so days fall as in the prototype.
import { createRequire } from "node:module";
const S = createRequire(import.meta.url)((process.env.REF_ENGINE ?? "/tmp/harness-ref/sleep-stats.js"));
export const MIN = 60000, HOUR = 3600000;
export const DAY0 = new Date(2026, 9, 17, 0, 0, 0, 0).getTime();
function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const at = (key, h, m) => S.atHour(key, 0) + (h * 60 + m) * MIN;
function sl(id, st) { return { id, stretches: st.map((x) => ({ start: x[0], end: x[1] })), closedAt: st[st.length - 1][1], deletedAt: null }; }
export function mock() {
  var r = rng(20261017), out = [], n = 0;
  function between(a, b) { return Math.round(a + (b - a) * r()); }
  var today = "2026-10-17";
  for (var i = 20; i >= 0; i--) {
    var D = S.addDays(today, -i), P = S.addDays(D, -1);
    var start = at(P, 0, 0) + between(19 * 60 + 10, 20 * 60 + 25) * MIN;
    var end = at(D, 0, 0) + between(5 * 60 + 50, 7 * 60 + 15) * MIN;
    var w = [0, 1, 1, 2, 2, 3][Math.floor(r() * 6)];
    var wakeLens = [], totalWake = 0;
    for (var k = 0; k < w; k++) { var wl = between(10, 40) * MIN; wakeLens.push(wl); totalWake += wl; }
    var asleep = end - start - totalWake, weights = [], wsum = 0;
    for (k = 0; k <= w; k++) { var wt = 0.6 + r() * 0.8; weights.push(wt); wsum += wt; }
    var stretches = [], t = start;
    for (k = 0; k <= w; k++) { var len = Math.round(asleep * weights[k] / wsum); stretches.push([t, t + len]); t += len; if (k < w) t += wakeLens[k]; }
    stretches[stretches.length - 1][1] = end;
    if (w >= 1 && r() < 0.07) { var cut = stretches.length - 1; out.push(sl("n" + (n++), stretches.slice(0, cut))); out.push(sl("n" + (n++), stretches.slice(cut))); }
    else out.push(sl("n" + (n++), stretches));
    var count = r() < 0.7 ? 3 : 4;
    var bases = [[8 * 60 + 25, 9 * 60 + 30, 40, 90], [11 * 60 + 45, 12 * 60 + 50, 55, 110], [15 * 60, 16 * 60, 30, 80], [17 * 60 + 10, 17 * 60 + 40, 15, 30]];
    var prevEnd = 0;
    for (k = 0; k < count; k++) {
      var s0 = at(D, 0, 0) + between(bases[k][0], bases[k][1]) * MIN;
      if (s0 < prevEnd + 60 * MIN) s0 = prevEnd + 60 * MIN;
      var L = between(bases[k][2], bases[k][3]) * MIN, e0 = s0 + L;
      if (e0 > at(D, 18, 25)) { e0 = at(D, 18, 25); if (e0 - s0 < 10 * MIN) continue; }
      if (r() < 0.1 && L > 50 * MIN) { var cutAt = s0 + Math.round(L * 0.6), gapL = between(8, 15) * MIN; out.push(sl("p" + (n++), [[s0, cutAt], [cutAt + gapL, e0 + gapL]])); e0 += gapL; }
      else out.push(sl("p" + (n++), [[s0, e0]]));
      prevEnd = e0;
    }
  }
  out.push({ id: "tonight", stretches: [{ start: at(today, 19, 50), end: at(today, 20, 55) }, { start: at(today, 21, 10), end: null }], closedAt: null, deletedAt: null });
  return out;
}
// What the app would know at time T: later sleeps do not exist yet, and a sleep under way is open.
export function asOf(sleeps, T) {
  var out = [];
  sleeps.forEach(function (sl0) {
    if (sl0.stretches[0].start >= T) return;
    var last = sl0.stretches[sl0.stretches.length - 1];
    if (last.end != null && last.end <= T) { out.push(sl0); return; }
    var st = [];
    sl0.stretches.forEach(function (x) { if (x.start >= T) return; st.push(x.end == null || x.end > T ? { start: x.start, end: null } : x); });
    out.push({ id: sl0.id, stretches: st, closedAt: null, deletedAt: null });
  });
  return out;
}
export const T_DEFAULT = DAY0 + (21 * 60 + 19) * MIN;   // Sat 17 Oct, 9:19 pm: "Evening, sleeping"
