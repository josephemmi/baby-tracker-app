"""Generates a short, visual, step-by-step user-guide PDF for one Nestlog feature.

The words live in a guide.json next to the screenshots (see
docs/user-guides/sleep-tracker/), so the guide can be reviewed in a diff and
regenerated whenever the feature changes. Screenshots are tight, element-scoped
shots of the real app with numbered badges and highlight rings already drawn in
(see "User guides" in CLAUDE.md for how they are captured).

Usage:
    python3 scripts/generate-user-guide.py <guide.json> <out.pdf>

Example:
    python3 scripts/generate-user-guide.py docs/user-guides/sleep-tracker/guide.json \
        /tmp/NestlogSleepTrackerUserGuidev1.12.pdf

guide.json: {"app", "feature", "version", "pages": [{"title", "lead", "rows": [
  {"cols": [[block, ...], [block, ...]]}]}]}. Two columns per row; each column
stacks blocks. A block is either an image (image, chip, chip_color, caption,
legend[], note) or a panel (panel: true, title, bullets[]). `**bold**` works in
any text. Images are scaled down together if a page would overflow.

Requires reportlab. Like the release notes, the PDF is attached to the release's
Linear ticket(s) and sent to the user via chat; Claude never uploads it to Drive.
"""

import json
import os
import re
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

W, H = A4
MARGIN = 40
GUTTER = 22
COL_W = (W - 2 * MARGIN - GUTTER) / 2
HEADER_H = 118  # eyebrow, title and lead, from the top margin
FOOTER_H = 30
ROW_GAP = 22
BLOCK_GAP = 16

PAPER = HexColor("#fbf7ec")
RAISED = HexColor("#fffdf8")
INK = HexColor("#2a2a26")
SOFT = HexColor("#6b6a63")
LINE = HexColor("#cfc4a9")
CHIP_COLORS = {
    "sage": HexColor("#4f7566"),
    "night": HexColor("#3d4d85"),
    "amber": HexColor("#a9731f"),
    "rose": HexColor("#8b4a63"),
    "ink": INK,
}
AMBER = HexColor("#c98a2e")  # the colour of the rings and badges in the screenshots

CAPTION = ParagraphStyle("caption", fontName="Helvetica", fontSize=10.5, leading=14.2, textColor=INK)
NOTE = ParagraphStyle("note", fontName="Helvetica", fontSize=9, leading=12, textColor=SOFT)
LEGEND = ParagraphStyle("legend", fontName="Helvetica", fontSize=9.8, leading=12.6, textColor=INK)
LEAD = ParagraphStyle("lead", fontName="Helvetica", fontSize=13, leading=17.5, textColor=SOFT)
PANEL_TITLE = ParagraphStyle("ptitle", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=INK)
PANEL_TEXT = ParagraphStyle("ptext", fontName="Helvetica", fontSize=10.2, leading=13.8, textColor=INK)


def md(text):
    """`**bold**` -> <b>bold</b>, with the rest escaped for Paragraph."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)


def para(text, style, width):
    p = Paragraph(md(text), style)
    _, h = p.wrap(width, 10_000)
    return p, h


class Guide:
    def __init__(self, spec, base_dir, out_path):
        self.spec = spec
        self.base = base_dir
        self.c = canvas.Canvas(out_path, pagesize=A4)
        self.c.setTitle(f"{spec['app']} {spec['feature']} guide")
        self.c.setAuthor(spec["app"])
        self.images = {}

    def image(self, rel):
        if rel not in self.images:
            reader = ImageReader(os.path.join(self.base, rel))
            self.images[rel] = (reader, *reader.getSize())
        return self.images[rel]

    def spaced(self, x, y, text, font, size, space):
        """Letter-spaced text (Canvas has no char-spacing setter of its own)."""
        # Tc (char spacing) is graphics state and would leak into every later string.
        self.c.saveState()
        t = self.c.beginText(x, y)
        t.setFont(font, size)
        t.setCharSpace(space)
        t.textOut(text)
        self.c.drawText(t)
        self.c.restoreState()

    # ---- blocks -------------------------------------------------------------------

    def block(self, x, y_top, block, scale, draw):
        """Draws (or just measures) one block with its top edge at y_top; returns its height."""
        c = self.c
        if block.get("panel"):
            return self.panel(x, y_top, block, draw)

        y = y_top
        chip = block.get("chip")
        if chip:
            label = chip.upper()
            w = stringWidth(label, "Helvetica-Bold", 8) + len(label) * 0.5 + 18
            if draw:
                c.setFillColor(CHIP_COLORS[block.get("chip_color", "night")])
                c.roundRect(x, y - 17, w, 17, 8.5, stroke=0, fill=1)
                c.setFillColor(white)
                self.spaced(x + 9, y - 12, label, "Helvetica-Bold", 8, 0.5)
            y -= 17 + 7

        reader, iw, ih = self.image(block["image"])
        dw = COL_W * scale
        dh = dw * ih / iw
        ix = x + (COL_W - dw) / 2
        if draw:
            c.saveState()
            path = c.beginPath()
            path.roundRect(ix, y - dh, dw, dh, 11)
            c.clipPath(path, stroke=0, fill=0)
            c.drawImage(reader, ix, y - dh, dw, dh)
            c.restoreState()
            c.setStrokeColor(LINE)
            c.setLineWidth(0.8)
            c.roundRect(ix, y - dh, dw, dh, 11, stroke=1, fill=0)
        y -= dh + 9

        text_w = COL_W - 4
        if block.get("caption"):
            p, h = para(block["caption"], CAPTION, text_w)
            if draw:
                p.drawOn(c, x + 2, y - h)
            y -= h + 5
        for i, line in enumerate(block.get("legend", []), start=1):
            p, h = para(line, LEGEND, text_w - 20)
            if draw:
                cx, cy = x + 9, y - 7.2
                c.setFillColor(INK)
                c.setStrokeColor(AMBER)
                c.setLineWidth(1.4)
                c.circle(cx, cy, 6.6, stroke=1, fill=1)
                c.setFillColor(white)
                c.setFont("Helvetica-Bold", 7.6)
                c.drawCentredString(cx, cy - 2.6, str(i))
                p.drawOn(c, x + 22, y - h)
            y -= max(h, 14) + 4
        if block.get("note"):
            p, h = para(block["note"], NOTE, text_w)
            if draw:
                p.drawOn(c, x + 2, y - h)
            y -= h + 4
        return y_top - y

    def panel(self, x, y_top, block, draw):
        c = self.c
        pad = 14
        inner = COL_W - 2 * pad
        title, th = para(block["title"], PANEL_TITLE, inner)
        items = [para(b, PANEL_TEXT, inner - 14) for b in block.get("bullets", [])]
        total = pad + th + 9 + sum(h + 7 for _, h in items) + pad - 7
        if draw:
            c.setFillColor(RAISED)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.8)
            c.roundRect(x, y_top - total, COL_W, total, 11, stroke=1, fill=1)
            title.drawOn(c, x + pad, y_top - pad - th)
            y = y_top - pad - th - 9
            for p, h in items:
                c.setFillColor(CHIP_COLORS["sage"])
                c.circle(x + pad + 3, y - 7.6, 2.4, stroke=0, fill=1)
                p.drawOn(c, x + pad + 14, y - h)
                y -= h + 7
        return total

    # ---- pages --------------------------------------------------------------------

    def page_height(self, page, scale):
        total = 0
        for r, row in enumerate(page["rows"]):
            heights = []
            for col in row["cols"]:
                heights.append(sum(self.block(0, 0, b, scale, False) for b in col) + BLOCK_GAP * (len(col) - 1))
            total += max(heights) + (ROW_GAP if r else 0)
        return total

    def fit_scale(self, page):
        avail = H - MARGIN - HEADER_H - FOOTER_H - MARGIN
        scale = 1.0
        while scale > 0.5 and self.page_height(page, scale) > avail:
            scale -= 0.01
        if self.page_height(page, scale) > avail:
            raise SystemExit(f"Page '{page['title']}' does not fit even at 50%: cut something.")
        return scale

    def draw_page(self, page, number, total):
        c = self.c
        c.setFillColor(PAPER)
        c.rect(0, 0, W, H, stroke=0, fill=1)

        # header
        c.setFillColor(CHIP_COLORS["sage"])
        self.spaced(MARGIN, H - MARGIN - 6, f"{self.spec['app'].upper()}  ·  {self.spec['feature'].upper()} GUIDE", "Helvetica-Bold", 8.5, 1.2)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 28)
        c.drawString(MARGIN, H - MARGIN - 42, page["title"])
        lead, lh = para(page["lead"], LEAD, W - 2 * MARGIN - 40)
        lead.drawOn(c, MARGIN, H - MARGIN - 52 - lh - 4)

        # content
        scale = self.fit_scale(page)
        y = H - MARGIN - HEADER_H
        for r, row in enumerate(page["rows"]):
            if r:
                y -= ROW_GAP
            heights = []
            for ci, col in enumerate(row["cols"]):
                x = MARGIN + ci * (COL_W + GUTTER)
                cy = y
                for bi, b in enumerate(col):
                    if bi:
                        cy -= BLOCK_GAP
                    cy -= self.block(x, cy, b, scale, True)
                heights.append(y - cy)
            y -= max(heights)

        # footer
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(MARGIN, MARGIN + 16, W - MARGIN, MARGIN + 16)
        c.setFillColor(SOFT)
        c.setFont("Helvetica", 8.5)
        c.drawString(MARGIN, MARGIN + 3, f"{self.spec['app']}  ·  {self.spec['feature']}  ·  v{self.spec['version']}")
        c.drawRightString(W - MARGIN, MARGIN + 3, f"{number} / {total}")
        c.showPage()

    def build(self):
        pages = self.spec["pages"]
        for i, page in enumerate(pages, start=1):
            self.draw_page(page, i, len(pages))
        self.c.save()


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    spec_path, out_path = sys.argv[1:]
    with open(spec_path) as f:
        spec = json.load(f)
    Guide(spec, os.path.dirname(os.path.abspath(spec_path)), out_path).build()
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
