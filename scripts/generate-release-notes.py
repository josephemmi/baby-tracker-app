"""Generates a standalone, scoped release-notes PDF for one Nestlog release.
Reads the version's section straight out of CHANGELOG.md so the PDF can
never drift from what's actually documented there.

Usage:
    python3 scripts/generate-release-notes.py <version> <changelog_path> <out_path> [screenshot ...]

Example:
    python3 scripts/generate-release-notes.py 1.6.0 CHANGELOG.md \
        /tmp/NestlogReleaseNotesv1.6.0.pdf /tmp/shot1.png /tmp/shot2.png

Trailing arguments are screenshots of the shipped feature(s), shown
FIRST, right under the title on page one (a PDF preview shows only page
one, and a release with a UI change must visibly have screenshots), in the
order given. Write each as `path.png::A short caption`; the caption is
optional. Up to three go side by side, four or more in rows of two, each
capped in height so tall phone-card shots stay readable.

Bullets may have indented sub-bullets (two-space `  - `); `**bold**` and
`code` in the text are rendered as bold and monospace.

Requires reportlab (pip install reportlab). Per CLAUDE.md's release
process, the resulting PDF is attached to the release's Linear ticket(s)
and sent to the user via chat — never uploaded to Google Drive by Claude
— see CLAUDE.md for the rest of the release checklist.
"""

import re
import sys
from datetime import datetime

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Image, Table, TableStyle

PAPER = HexColor("#fbf7ec")
INK = HexColor("#2a2a26")
INK_SOFT = HexColor("#6b6a63")
SAGE = HexColor("#4f7566")
LINE_STRONG = HexColor("#cfc4a9")

SECTION_COLORS = {
    "Added": HexColor("#4f7566"),
    "Changed": HexColor("#c98a2e"),
    "Fixed": HexColor("#a45d3f"),
    "Removed": HexColor("#a45d3f"),
}


def inline(text):
    """Escape for Paragraph, then turn `**bold**` and `code` into markup."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"`([^`]+)`", r'<font face="Courier" size="9.5">\1</font>', text)


def split_shot(arg):
    """`path.png::Caption` -> (path, caption)."""
    path, _, caption = arg.partition("::")
    return path, caption.strip()


def screenshot_block(shots, content_width):
    """The shipped UI, up front, in a grid of captioned screenshots."""
    if not shots:
        return []
    caption_style = ParagraphStyle(
        "ShotCaption", fontName="Helvetica", fontSize=9, leading=12,
        textColor=INK_SOFT, alignment=1, spaceBefore=5, spaceAfter=10,
    )
    label_style = ParagraphStyle(
        "ShotLabel", fontName="Helvetica-Bold", fontSize=11.5, spaceBefore=14,
        spaceAfter=8, textColor=SAGE, keepWithNext=1,
    )
    items = [split_shot(s) for s in shots]
    cols = len(items) if len(items) <= 3 else 2
    rows = [items[i:i + cols] for i in range(0, len(items), cols)]
    pad = 6
    slot = content_width / cols - 2 * pad
    max_h = (4.4 if len(rows) == 1 else 3.1) * inch
    # One width for every image, so the columns line up: the widest that still
    # lets the tallest image fit under max_h.
    loaded = [(Image(path), caption) for path, caption in items]
    # Read imageWidth/imageHeight before setting drawWidth/drawHeight —
    # reportlab lazily computes the former on first access and that
    # computation clobbers drawWidth/drawHeight back to native pixel size,
    # undoing an override made beforehand.
    width = min([slot] + [max_h * img.imageWidth / img.imageHeight for img, _ in loaded])
    table_rows = []
    pos = 0
    for row in rows:
        cells = []
        for _ in row:
            img, caption = loaded[pos]
            pos += 1
            img.drawWidth = width
            img.drawHeight = width * img.imageHeight / img.imageWidth
            img.hAlign = "CENTER"
            cell = [img]
            if caption:
                cell.append(Paragraph(inline(caption), caption_style))
            cells.append(cell)
        cells += [""] * (cols - len(cells))
        table_rows.append(cells)
    grid = Table(table_rows, colWidths=[content_width / cols] * cols)
    grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), pad), ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Paragraph("What it looks like", label_style), grid]


def parse_changelog_section(changelog_path, version):
    text = open(changelog_path).read()
    # Grab this version's heading line (captures its date) and body up to the next `## [` heading.
    pattern = rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)"
    m = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if not m:
        raise SystemExit(f"Version {version} not found in {changelog_path}")

    heading_line = re.search(rf"^## \[{re.escape(version)}\].*$", text, re.MULTILINE).group(0)
    date_match = re.search(r"- (\d{4}-\d{2}-\d{2})", heading_line)
    date_str = date_match.group(1) if date_match else ""

    body = m.group(1)
    sections = {}
    current = None
    last = None  # "item" or "sub": what a wrapped line continues
    for line in body.splitlines():
        h = re.match(r"^### (\w+)", line)
        if h:
            current = h.group(1)
            sections[current] = []
            continue
        item = re.match(r"^- (.*)", line)
        sub = re.match(r"^  - (.*)", line)
        if item and current:
            sections[current].append({"text": item.group(1), "subs": []})
            last = "item"
        elif sub and current and sections[current]:
            sections[current][-1]["subs"].append(sub.group(1))
            last = "sub"
        elif line.strip() and current and sections[current]:
            # continuation of a wrapped bullet or sub-bullet
            entry = sections[current][-1]
            if last == "sub" and entry["subs"]:
                entry["subs"][-1] += " " + line.strip()
            else:
                entry["text"] += " " + line.strip()
    return date_str, sections


def build_pdf(version, date_str, sections, out_path, screenshots=None):
    doc = SimpleDocTemplate(
        out_path,
        pagesize=LETTER,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        title=f"Nestlog Release Notes v{version}",
    )

    brand_style = ParagraphStyle(
        "Brand", fontName="Helvetica-Bold", fontSize=13, textColor=SAGE, spaceAfter=2,
    )
    title_style = ParagraphStyle(
        "Title", fontName="Helvetica-Bold", fontSize=26, leading=32, textColor=INK, spaceAfter=10,
    )
    meta_style = ParagraphStyle(
        "Meta", fontName="Helvetica", fontSize=10.5, textColor=INK_SOFT, spaceAfter=18,
    )
    section_style = ParagraphStyle(
        "Section", fontName="Helvetica-Bold", fontSize=11.5, spaceBefore=16, spaceAfter=8,
        keepWithNext=1,
    )
    bullet_style = ParagraphStyle(
        "Bullet", fontName="Helvetica", fontSize=10.5, textColor=INK,
        leading=15, spaceAfter=7, leftIndent=14, bulletIndent=0,
    )
    sub_style = ParagraphStyle(
        "SubBullet", parent=bullet_style, fontSize=10, leading=14, spaceAfter=5,
        leftIndent=30, bulletIndent=16,
    )

    story = [
        Paragraph("NESTLOG", brand_style),
        Paragraph(f"Release Notes — v{version}", title_style),
        Paragraph(
            (datetime.strptime(date_str, "%Y-%m-%d").strftime("%B %-d, %Y") if date_str else ""),
            meta_style,
        ),
        HRFlowable(width="100%", thickness=1, color=LINE_STRONG, spaceAfter=6),
    ]

    content_width = LETTER[0] - 1.8 * inch
    story.extend(screenshot_block(screenshots or [], content_width))

    order = ["Added", "Changed", "Fixed", "Removed"]
    for kind in order:
        items = sections.get(kind)
        if not items:
            continue
        color = SECTION_COLORS.get(kind, INK)
        story.append(Paragraph(kind, ParagraphStyle(
            f"Section{kind}", parent=section_style, textColor=color,
        )))
        for item in items:
            story.append(Paragraph(f"&bull;&nbsp;&nbsp;{inline(item['text'])}", bullet_style))
            for sub in item["subs"]:
                story.append(Paragraph(f"&bull;&nbsp;&nbsp;{inline(sub)}", sub_style))

    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE_STRONG, spaceAfter=6))
    story.append(Paragraph(
        "Nestlog — a shared baby-tracking app for Joseph &amp; Jen.",
        ParagraphStyle("Footer", fontName="Helvetica-Oblique", fontSize=9, textColor=INK_SOFT),
    ))

    def paint_background(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, LETTER[0], LETTER[1], stroke=0, fill=1)
        canvas.restoreState()

    doc.build(story, onFirstPage=paint_background, onLaterPages=paint_background)


if __name__ == "__main__":
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    version = sys.argv[1]
    changelog_path = sys.argv[2]
    out_path = sys.argv[3]
    screenshots = sys.argv[4:]
    date_str, sections = parse_changelog_section(changelog_path, version)
    build_pdf(version, date_str, sections, out_path, screenshots)
    print(f"Wrote {out_path} ({date_str})")
    for kind, items in sections.items():
        print(f"  {kind}: {len(items)} item(s)")
