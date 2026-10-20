"""Builds the Log tile layouts page, round 2 (one self-contained HTML file), from the screenshots in ../tiles2 (and one from ../tiles)."""
import base64, io, json, os
from PIL import Image

SP = os.environ.get("HARNESS_OUT", "/tmp/harness-out")
T2 = f"{SP}/tiles2"
T1 = f"{SP}/tiles"
facts = json.load(open(f"{T2}/facts.json"))
facts1 = json.load(open(f"{T1}/facts.json"))

TABLET = {(w, v, s) for w in (640, 768, 1024) for v in ("A", "H", "S", "N") for s in ("sleeping", "paused", "resting")}
PHONE = {(390, v, s) for v in ("P0", "P1", "P2", "P3", "P4") for s in ("sleeping", "paused", "resting", "none")}
WANT = TABLET | PHONE


def webp_uri(png_path):
    im = Image.open(png_path).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=80, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


images, meta = {}, {}
for f in facts:
    k = (f["w"], f["variant"], f["state"])
    if k not in WANT:
        continue
    key = f'{f["w"]}-{f["variant"]}-{f["state"]}'
    images[key] = webp_uri(f"{T2}/{key}.png")
    meta[key] = {
        "w": f["w"], "h": f["height"], "grid": f["gridH"], "logY": f["logY"],
        "tiles": [{"label": t["label"], "x": t["x"], "y": t["y"], "w": t["w"], "h": t["h"], "blank": t["blank"]} for t in f["tiles"]],
        "pill": f["pill"],
    }

# Round 1's picture of option B at 1024 px: what option D turns into from 1024 px up
r1 = next(f for f in facts1 if f["w"] == 1024 and f["variant"] == "B" and f["state"] == "sleeping")
images["r1-1024-B-sleeping"] = webp_uri(f"{T1}/1024-B-sleeping.png")
meta["r1-1024-B-sleeping"] = {"w": 1024, "h": r1["height"], "grid": r1["gridH"], "logY": None, "tiles": [], "pill": None}

html = r'''<title>Last sleep tile layouts</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One column. Short answers, then Part 1 (wide screens) and Part 2 (phone): a control strip and one card per option, each with the real screenshot. */
:root {
  --bg: #fbf7ec; --raised: #fffdf8; --ink: #2a2a26; --soft: #6b6a63; --line: #e3dbc8; --line-strong: #cfc4a9;
  --sage: #4f7566; --sage-soft: #e4ede8; --night: #2a3563; --night-soft: #dde5f3; --frame: #d9cfb6;
  --warn: #9a3b3b; --warn-soft: rgba(154, 59, 59, 0.2);
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1c1c19; --raised: #252521; --ink: #f1eee3; --soft: #aaa79a; --line: #38382f; --line-strong: #4b4a3f;
    --sage: #8fb7a6; --sage-soft: #26332d; --night: #a9b7ec; --night-soft: #262c47; --frame: #4b4a3f; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #1c1c19; --raised: #252521; --ink: #f1eee3; --soft: #aaa79a; --line: #38382f; --line-strong: #4b4a3f;
  --sage: #8fb7a6; --sage-soft: #26332d; --night: #a9b7ec; --night-soft: #262c47; --frame: #4b4a3f; color-scheme: dark;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: var(--font); font-size: 15px; line-height: 1.5; margin: 0;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 56px; }
main { max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }
h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; letter-spacing: -0.01em; text-wrap: balance; }
h2 { font-size: 20px; line-height: 1.25; margin: 0; text-wrap: balance; }
h3 { font-size: 16px; line-height: 1.3; margin: 0; text-wrap: balance; }
p { margin: 0; }
.lead { color: var(--soft); max-width: 66ch; }
section > h2 { margin-bottom: 8px; }
.intro { color: var(--soft); max-width: 70ch; margin-bottom: 14px; }
.answers { display: grid; gap: 12px; grid-template-columns: 1fr; }
.answer { background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.answer p { color: var(--soft); max-width: 78ch; }
.answer b { color: var(--ink); }
.panel { background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-width: 0; }
.row > .label { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--soft); width: 76px; flex: none; }
.seg { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.seg button { font: inherit; font-size: 14px; font-weight: 700; min-height: 40px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line-strong);
  background: transparent; color: var(--soft); cursor: pointer; }
.seg button small { font-weight: 400; color: inherit; opacity: 0.85; margin-left: 4px; }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--raised); border-color: var(--ink); }
.seg button:focus-visible { outline: 3px solid var(--night); outline-offset: 2px; }
.cards { display: flex; flex-direction: column; gap: 18px; }
.phones { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); align-items: start; }
.card { background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.card.pr { border-color: var(--night); box-shadow: 0 0 0 1px var(--night); }
.card header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.tag { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--night-soft); color: var(--night); }
.tag.base { background: var(--line); color: var(--soft); }
.facts { color: var(--soft); font-size: 14px; display: flex; flex-direction: column; gap: 3px; max-width: 72ch; }
.facts b { color: var(--ink); }
.facts .cost { color: var(--ink); }
.shot { position: relative; width: 100%; }
figure { margin: 0; overflow-x: auto; border-radius: 10px; border: 1px solid var(--frame); background: var(--bg); }
figure img { display: block; width: 100%; height: auto; }
.hatch { position: absolute; border: 1.5px dashed var(--warn); border-radius: 4px; pointer-events: none;
  background: repeating-linear-gradient(45deg, var(--warn-soft) 0 6px, transparent 6px 12px); display: flex; align-items: center; justify-content: center; }
.hatch span { font-size: 11px; font-weight: 700; line-height: 1; color: var(--warn); background: #fffdf8; border: 1px solid var(--warn); border-radius: 999px; padding: 3px 7px; white-space: nowrap; }
.twin { display: grid; gap: 12px; grid-template-columns: 1fr; }
.twin figcaption { font-size: 13px; color: var(--soft); padding: 8px 10px 10px; }
.pick { border-left: 4px solid var(--sage); padding: 4px 0 4px 14px; max-width: 74ch; display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
.pick h3 { color: var(--sage); font-size: 17px; }
.next { background: var(--night-soft); color: var(--ink); border-radius: 12px; padding: 14px 16px; max-width: 74ch; display: flex; flex-direction: column; gap: 6px; }
.next h2 { font-size: 17px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: var(--line); padding: 1px 5px; border-radius: 4px; }
@media (min-width: 760px) { .answers { grid-template-columns: repeat(3, 1fr); } .twin { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .row > .label { width: 100%; } }
@media (prefers-reduced-motion: no-preference) { .seg button { transition: background-color .12s, color .12s; } }
</style>

<main>
  <header>
    <h1>Last sleep tile layouts</h1>
    <p class="lead">Round 2, answering your last comment: the empty space on a tablet, what option D was, and a more compact phone. Every picture is the real app at that width, with the numbers measured from it, not a sketch.</p>
  </header>

  <section class="answers" aria-label="Short answers">
    <div class="answer">
      <h3>One component, many sizes</h3>
      <p><b>Yes, and that is how it is built.</b> The Log tiles are one component, and the screen width only changes a few classes (columns, padding, text size). There is no tablet tile and phone tile, and no option here adds one. The word you want is <b>responsive</b>. Option H goes a step further: the tile reacts to its own width instead of the screen&rsquo;s (a container query) to decide where the pill sits. The phone sizes would be kept as spacing and type tokens, so every tile at a given width takes its size from one place. That is the same job as the token work in JOS-66.</p>
    </div>
    <div class="answer">
      <h3>Why Last pee has the empty space</h3>
      <p>A row of tiles is as tall as its tallest tile. Last sleep carries the pill under its value (48 px), so Last pee next to it is stretched to match, and its lower half is empty. Without a pill all four tiles are 83 px tall and nothing is wasted. The same 48 px is why starting or ending a sleep makes everything below the tiles jump down or up today, on a tablet and on a phone.</p>
    </div>
    <div class="answer">
      <h3>What option D was</h3>
      <p>D was a rule, not a look: use A (two by two) below 1024 px wide and B (four across) from 1024 px up. So you are right that it looks like A almost everywhere. An 11-inch iPad held upright (about 820 px) gets A; held sideways (about 1180 px) it gets B, with the pill squeezed onto two lines. Anything wider than 1024 px looks the same, because the content stops growing at 896 px. You picked two by two, so D is dropped. Both pictures are at the bottom.</p>
    </div>
  </section>

  <section id="part1">
    <h2>Part 1. Tablet and other wide screens (640 px and up)</h2>
    <p class="intro">The same four tiles, four ways of dealing with the pill. A is what is in the PR now. Pick a width and a tile state; the hatched areas mark the empty space (switch them off if they get in the way). A phone held upright is Part 2.</p>
    <div class="panel" aria-label="What to look at">
      <div class="row"><span class="label">Screen</span><div class="seg" id="seg-width"></div></div>
      <div class="row"><span class="label">Tile</span><div class="seg" id="seg-state"></div></div>
      <div class="row"><span class="label">Size</span><div class="seg" id="seg-scale"></div></div>
      <div class="row"><span class="label">Gaps</span><div class="seg" id="seg-hatch"></div></div>
    </div>
    <div id="view1" class="cards"></div>
    <div class="pick">
      <h3>My pick: H, the pill beside the label</h3>
      <p>All four tiles are the same height with no empty space, and nothing below them moves when a sleep starts or ends: the block stays 177 px in all three states, where in A, S and N it grows by 48 px. It is also 48 px shorter than today while a sleep is open. The price is a second, smaller size of the pill, 24 px high with 12 px text, where the Reports pill stays 36 px. One exception: a tile narrower than about 17 rem cannot fit the pill beside the label, so there it drops back under the value, as today. That is a window 640 to 690 px wide or a 320 px phone, not a common device.</p>
      <p>S is the safe choice if you want the pill to stay big: four equal tiles, but a full-width bar that costs the same 48 px and jumps the page. N is the least code and the least tidy.</p>
    </div>
  </section>

  <section id="part2">
    <h2>Part 2. A more compact phone (390 px wide, held upright)</h2>
    <p class="intro">Five ways to make the tiles take less height, so the Log button and the entries come up the screen. P1 is H from Part 1 and nothing else. P2 adds tighter padding and a smaller value. P3 puts two tiles side by side like on a tablet. P4 turns the tiles into one list. The heights are for the block of tiles, without the header.</p>
    <div class="panel" aria-label="What to look at">
      <div class="row"><span class="label">Tile</span><div class="seg" id="seg-state2"></div></div>
      <div class="row"><span class="label">Size</span><div class="seg" id="seg-scale2"></div></div>
    </div>
    <div id="view2" class="phones"></div>
    <div class="pick">
      <h3>My pick: P1, and P2 if you want more room</h3>
      <p>P1 is the same component as tablet H: no new content, 48 px shorter while a sleep is open, and nothing moves when a sleep starts. P2 is the same look at a smaller size, another 68 px. P3 and P4 are the big savers (about 180 px) but they are redesigns: P3 adds clock times to three tiles so that all four have the same shape, and on a 320 px phone its values wrap onto two lines; P4 changes the look from tiles to a list. I would not take either without a reason. P3 is the one that makes phone and tablet the same two by two, only smaller.</p>
    </div>
  </section>

  <section id="dpics">
    <h2>What option D looked like</h2>
    <p class="intro">Below 1024 px wide D is A. From 1024 px up it is B, four across. These are the two pictures.</p>
    <div class="twin" id="dview"></div>
  </section>

  <section class="next">
    <h2>What I need from you</h2>
    <p>The letter for the tablet (H, S, N, or A as it is) and the one for the phone (P0 to P4). It is a small change on PR #44: the tile in <code>glance-cards.tsx</code> and, for H, one more size of the pill in <code>sleep-pill.tsx</code>. If it moves the tile on a phone, the tile pictures in the guide and the release notes get reshot and both PDFs resent.</p>
  </section>
</main>

<script>
const IMG = __IMG__;
const META = __META__;
const T_WIDTHS = [
  { id: 640, label: "640", sub: "small window" },
  { id: 768, label: "768", sub: "iPad upright" },
  { id: 1024, label: "1024", sub: "iPad sideways and wider" },
];
const STATES = [
  { id: "sleeping", label: "Sleeping now" },
  { id: "paused", label: "Paused" },
  { id: "resting", label: "Resting" },
];
const P_STATES = STATES.concat([{ id: "none", label: "Nothing logged" }]);
const T_OPTS = [
  { id: "A", name: "Pill under the value", tag: "In the PR now", base: true, blurb: "Two by two. The pill takes a row of its own at the bottom of Last sleep, and Last pee is stretched to match." },
  { id: "H", name: "Pill beside the label", tag: "My pick", pr: true, blurb: "The pill moves up to the label row, at the right, in a smaller size. It takes no height of its own, so the four tiles stay equal." },
  { id: "S", name: "Pill as a bar under all four tiles", blurb: "The pill leaves the tile and spans the whole width under the grid, only while a sleep is open. The four tiles stay equal." },
  { id: "N", name: "Tiles keep their own height", blurb: "Nothing is stretched, so no tile has empty space inside it. The gap moves outside the card, under Last pee." },
];
const P_OPTS = [
  { id: "P0", name: "Now", tag: "In the PR now", base: true, blurb: "One column, four tiles, the pill on its own row inside Last sleep." },
  { id: "P1", name: "Pill beside the label", tag: "My pick", pr: true, blurb: "Tablet H on the phone. The same tiles, the pill moved up to the label row." },
  { id: "P2", name: "P1, tighter", blurb: "As P1, with 12 px of padding instead of 16, a 20 px value instead of 24, and 8 px between tiles instead of 12." },
  { id: "P3", name: "Two by two", blurb: "The tablet layout on the phone: two tiles per row, a 20 px value, the detail under it, the pill as a bar. The three older tiles get a clock time as their detail, which is new text." },
  { id: "P4", name: "One list", blurb: "One card with four rows: label on the left, value to its right, the pill under the last row." },
];
const T_NOTES = {
  "H-640": "At 640 px the tile is too narrow for the pill beside the label, so it stays under the value, as in A. It moves up from about 690 px.",
  "S-1024": "The bar is 896 px wide, the widest the content ever gets.",
};
const P_NOTES = {
  P1: "Below about 17 rem of tile width (a 320 px phone) the pill stays under the value, as in P0.",
  P3: "On a 320 px phone the values wrap onto two lines. It adds clock times to three tiles.",
  P4: "A long row, such as a feed with the amount, wraps on a 320 px phone.",
};

const st = { width: 768, state: "sleeping", state2: "sleeping", scale: "fit", hatch: true };
try { const s = JSON.parse(localStorage.getItem("tiles-view-2") || "null"); if (s) Object.assign(st, s); } catch (e) {}
if (!T_WIDTHS.some((w) => w.id === st.width)) st.width = 768;

function seg(el, items, current, onPick, sub) {
  el.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(it.id === current));
    b.innerHTML = it.label + (sub && it.sub ? "<small>" + it.sub + "</small>" : "");
    b.addEventListener("click", () => onPick(it.id));
    el.appendChild(b);
  });
}
const r = (n) => Math.round(n);
function heights(m) {
  const h = m.tiles.map((t) => r(t.h));
  return h.every((x) => x === h[0]) ? "All four tiles are <b>" + h[0] + " px</b> tall." : "Tile heights: <b>" + h.join(", ") + " px</b>.";
}
function shot(key, alt, overlays, extra) {
  const m = META[key];
  const fit = st.scale === "fit";
  const boxes = (overlays || []).map((o) =>
    "<div class='hatch' aria-hidden='true' style='left:" + (o.x / m.w * 100) + "%;top:" + (o.y / m.h * 100) + "%;width:" + (o.w / m.w * 100) + "%;height:" + (o.h / m.h * 100) + "%'><span>" + o.text + "</span></div>").join("");
  return "<figure><div class='shot' style='" + (fit ? "max-width:" + m.w + "px" : "width:" + m.w + "px") + "'><img alt='" + alt + "' src='" + IMG[key] + "' width='" + m.w + "' height='" + m.h + "'>" + boxes + "</div></figure>";
}
function blanks(m) {
  const out = [];
  m.tiles.forEach((t) => { if (t.blank > 0.5) out.push({ x: t.x + 17, y: t.y + t.h - 17 - t.blank, w: t.w - 34, h: t.blank, text: r(t.blank) + " px empty" }); });
  return out;
}
function notch(m) {
  // a tile that is shorter than the tallest tile in its own row leaves a gap under it
  const rows = {};
  m.tiles.forEach((t) => { const k = r(t.y); (rows[k] = rows[k] || []).push(t); });
  const out = [];
  Object.keys(rows).forEach((k) => {
    const bottom = Math.max.apply(null, rows[k].map((t) => t.y + t.h));
    rows[k].forEach((t) => { if (t.y + t.h < bottom - 0.5) out.push({ x: t.x, y: t.y + t.h, w: t.w, h: bottom - (t.y + t.h), text: r(bottom - (t.y + t.h)) + " px gap" }); });
  });
  return out;
}
function shiftText(w, v, state) {
  if (state === "resting" || state === "none") return "";
  const a = META[w + "-" + v + "-" + state].grid, b = META[w + "-" + v + "-resting"].grid;
  const d = r(a - b);
  return d === 0 ? "<p class='cost'>Starting or ending a sleep moves <b>nothing</b> below the tiles.</p>" : "<p class='cost'>Starting or ending a sleep moves everything below by <b>" + d + " px</b>.</p>";
}
function tabletCard(w, opt) {
  const key = w + "-" + opt.id + "-" + st.state;
  const m = META[key];
  const base = META[w + "-A-" + st.state];
  const delta = r(m.grid - base.grid);
  const sizing = opt.id === "A" ? "Tile block <b>" + r(m.grid) + " px</b> tall." : "Tile block <b>" + r(m.grid) + " px</b> tall, " + (delta === 0 ? "the same as A." : Math.abs(delta) + " px " + (delta > 0 ? "more" : "less") + " than A.");
  const empty = m.tiles.reduce((s, t) => s + (t.blank > 0.5 ? t.blank : 0), 0);
  const emptyText = empty > 0.5 ? "Empty space inside a tile: <b>" + r(empty) + " px</b>." : "No empty space inside any tile.";
  const note = T_NOTES[opt.id + "-" + w] || "";
  const overlays = st.hatch ? blanks(m).concat(opt.id === "N" ? notch(m) : []) : [];
  const el = document.createElement("article");
  el.className = "card" + (opt.pr ? " pr" : "");
  el.innerHTML =
    "<header><h3>" + opt.id + ". " + opt.name + "</h3>" + (opt.tag ? '<span class="tag' + (opt.base ? " base" : "") + '">' + opt.tag + "</span>" : "") + "</header>" +
    '<div class="facts"><p>' + opt.blurb + "</p><p>" + sizing + " " + heights(m) + " " + emptyText + "</p>" + shiftText(w, opt.id, st.state) + (note ? "<p>" + note + "</p>" : "") + "</div>" +
    shot(key, "Log screen at " + w + " px wide, option " + opt.id, overlays);
  return el;
}
function phoneCard(opt) {
  const key = "390-" + opt.id + "-" + st.state2;
  const m = META[key];
  const base = META["390-P0-" + st.state2];
  const delta = r(m.grid - base.grid);
  const sizing = opt.id === "P0" ? "Tile block <b>" + r(m.grid) + " px</b> tall." : "Tile block <b>" + r(m.grid) + " px</b> tall, " + (delta === 0 ? "the same as now." : Math.abs(delta) + " px " + (delta > 0 ? "more" : "less") + " than now.");
  const note = P_NOTES[opt.id] || "";
  const el = document.createElement("article");
  el.className = "card" + (opt.pr ? " pr" : "");
  el.innerHTML =
    "<header><h3>" + opt.id + ". " + opt.name + "</h3>" + (opt.tag ? '<span class="tag' + (opt.base ? " base" : "") + '">' + opt.tag + "</span>" : "") + "</header>" +
    '<div class="facts"><p>' + opt.blurb + "</p><p>" + sizing + " Log a moment starts <b>" + r(m.logY) + " px</b> from the top.</p>" + shiftText(390, opt.id, st.state2) + (note ? "<p>" + note + "</p>" : "") + "</div>" +
    shot(key, "Log screen on a phone, option " + opt.id, []);
  return el;
}
function render() {
  try { localStorage.setItem("tiles-view-2", JSON.stringify(st)); } catch (e) {}
  const scaleItems = [{ id: "fit", label: "Fit to screen" }, { id: "true", label: "True size" }];
  const setScale = (v) => { st.scale = v; render(); };
  seg(document.getElementById("seg-width"), T_WIDTHS, st.width, (v) => { st.width = v; render(); }, true);
  seg(document.getElementById("seg-state"), STATES, st.state, (v) => { st.state = v; render(); });
  seg(document.getElementById("seg-scale"), scaleItems, st.scale, setScale);
  seg(document.getElementById("seg-hatch"), [{ id: "on", label: "Show empty space" }, { id: "off", label: "Hide" }], st.hatch ? "on" : "off", (v) => { st.hatch = v === "on"; render(); });
  seg(document.getElementById("seg-state2"), P_STATES, st.state2, (v) => { st.state2 = v; render(); });
  seg(document.getElementById("seg-scale2"), scaleItems, st.scale, setScale);
  const v1 = document.getElementById("view1");
  v1.innerHTML = "";
  v1.classList.toggle("true", st.scale === "true");
  T_OPTS.forEach((o) => v1.appendChild(tabletCard(st.width, o)));
  const v2 = document.getElementById("view2");
  v2.innerHTML = "";
  v2.classList.toggle("true", st.scale === "true");
  P_OPTS.forEach((o) => v2.appendChild(phoneCard(o)));
  const dv = document.getElementById("dview");
  dv.classList.toggle("true", st.scale === "true");
  const a = "768-A-sleeping", b = "r1-1024-B-sleeping";
  dv.innerHTML =
    "<div class='card'><h3>D at 768 px: the same as A</h3>" + shot(a, "Option D at 768 px wide, two by two", []) + "<p class='facts'>Two by two. iPad upright, or a phone held sideways.</p></div>" +
    "<div class='card'><h3>D at 1024 px and wider: the same as B</h3>" + shot(b, "Option D at 1024 px wide, four across", []) + "<p class='facts'>Four across. The pill is squeezed onto two lines and &ldquo;mL&rdquo; drops under the feed time.</p></div>";
}
render();
</script>
'''
html = html.replace("__IMG__", json.dumps(images)).replace("__META__", json.dumps(meta))
out = f"{SP}/tiles-page.html"
open(out, "w").write(html)
print("wrote", out, round(len(html) / 1e6, 2), "MB,", len(images), "images")
