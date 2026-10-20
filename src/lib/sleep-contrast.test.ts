// Contrast of the sleep colours (JOS-83), read from the real tokens in
// globals.css so a changed hex fails here instead of on someone's phone.
//
// JOS-69 will replace this with the contrast test for every token pair, on
// every theme. Until it lands, these are the pairs sleep adds; move the PAIRS
// below into its list when it does (same shape: foreground, background, the
// ratio WCAG 2.1 asks for, and where the pair is used).
//
// To add a pair when adding a component: put the two token names in PAIRS with
// the ratio that applies (4.5 for text under 18 px or 14 px bold, 3 for large
// text and for borders, icons and other parts of a control) and a note on where
// it appears. Ratios use the exact hex, never a rounded one.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// --color-night: #2a3563;  ->  { night: "#2a3563" } (the @theme block only has
// plain hex colours, no var() references to follow).
const TOKENS: Record<string, string> = {};
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  TOKENS[m[1]] = m[2].toLowerCase();
}

const hex = (name: string): string => {
  const value = name.startsWith("#") ? name : TOKENS[name];
  if (!value) throw new Error(`no colour token called ${name}`);
  return value;
};

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(color: string): number {
  const h = hex(color).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// Degrees round the colour wheel, 0 to 360.
function hue(color: string): number {
  const h = hex(color).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (raw * 60 + 360) % 360;
}

interface Pair {
  fg: string;
  bg: string;
  min: number;
  use: string;
}

const PAIRS: Pair[] = [
  // Text on the sleep colour
  { fg: "#ffffff", bg: "night", min: 4.5, use: "'Sleeping now' pill; Resume sleep button; Stop and save in the short-sleep box" },
  // The sleep colour as text and as a part of a control
  { fg: "night", bg: "paper", min: 4.5, use: "Reports values and bold times; 'Started earlier?' link; stat cards" },
  { fg: "night", bg: "paper-raised", min: 4.5, use: "the big timer, Pause sleep button text, charts' labels on a card" },
  { fg: "night", bg: "night-soft", min: 4.5, use: "the Sleep tile label and tick; timer units; the readout box above a chart" },
  { fg: "night", bg: "paper", min: 3, use: "the card's border, the paused pill's dot, bars and the 24-hour pattern against the page" },
  { fg: "night", bg: "paper-raised", min: 3, use: "bars, the day strip and the pattern against a card" },
  // Text on the tint
  { fg: "ink", bg: "night-soft", min: 4.5, use: "the running card's 'Started' line (ink-soft is only 4.29:1 here, so it is not used)" },
  // The other pill states
  { fg: "ink", bg: "paper", min: 4.5, use: "'Paused' pill" },
  { fg: "ink", bg: "sage-soft", min: 4.5, use: "'Awake' pill" },
  { fg: "ink-soft", bg: "paper", min: 4.5, use: "'No sleeps logged yet' pill; the line under the Today number" },
  { fg: "ink-soft", bg: "paper-raised", min: 4.5, use: "captions and axis labels on a card" },
  // Delete sleep
  { fg: "danger", bg: "paper-raised", min: 4.5, use: "Delete sleep button label on a card" },
  { fg: "danger", bg: "paper", min: 4.5, use: "Delete sleep button label while hovered (the button takes the page colour)" },
];

describe("the sleep colours", () => {
  it("are the two values everything sleep uses: one indigo and one pale tint", () => {
    expect(TOKENS["night"]).toBe("#2a3563");
    expect(TOKENS["night-soft"]).toBe("#dde5f3");
    // The third value of v1.12 to v1.13 is gone, so nothing can quietly still use it.
    expect(TOKENS["night-deep"]).toBeUndefined();
    expect(css).not.toMatch(/#3d4d85|#e2e6f3/i);
  });

  it.each(PAIRS)("$fg on $bg is at least $min:1 ($use)", ({ fg, bg, min }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("gets the spec's figures (white on sleep 11.75, sleep on tint 9.27, sleep on paper 10.97)", () => {
    expect(contrast("#ffffff", "night")).toBeCloseTo(11.75, 2);
    expect(contrast("night", "night-soft")).toBeCloseTo(9.27, 2);
    expect(contrast("night", "paper")).toBeCloseTo(10.97, 2);
  });

  it("stay clearly blue: never Pump's violet and never Breast's teal", () => {
    // Pump is about 257 to 266 degrees, Breast about 164 to 177, Bottle 202.
    // Sleep sits at about 228 and its tint at about 218.
    expect(hue("night")).toBeGreaterThan(215);
    expect(hue("night")).toBeLessThan(240);
    expect(hue("night-soft")).toBeGreaterThan(210);
    expect(hue("night-soft")).toBeLessThan(235);
    const gap = (a: string, b: string) => Math.abs(hue(a) - hue(b));
    expect(gap("night-soft", "cat-pump-soft")).toBeGreaterThanOrEqual(30);
    expect(gap("night", "cat-pump")).toBeGreaterThanOrEqual(20);
    expect(gap("night", "cat-breast")).toBeGreaterThanOrEqual(30);
    expect(gap("night-soft", "cat-breast-soft")).toBeGreaterThanOrEqual(30);
    // Not the old, more violet tint either.
    expect(hue("night-soft")).toBeLessThan(hue("#e2e6f3"));
  });
});

describe("the contrast helper", () => {
  it("matches the WCAG reference ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 on white is the classic "just passes AA" grey.
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});
