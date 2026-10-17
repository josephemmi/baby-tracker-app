"""Generates a standalone, scoped release-notes PDF for one Nestlog release.
Reads the version's section straight out of CHANGELOG.md so the PDF can
never drift from what's actually documented there.

Usage:
    python3 scripts/generate-release-notes.py <version> <changelog_path> <out_path> [screenshot ...]

Example:
    python3 scripts/generate-release-notes.py 1.6.0 CHANGELOG.md \
        /tmp/NestlogReleaseNotesv1.6.0.pdf /tmp/shot1.png /tmp/shot2.png

Trailing arguments are optional screenshots of the shipped feature(s),
embedded after the changelog bullets in the order given, side by side in
one row (each capped in height, so tall phone-card shots stay readable).

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

    content_width = LETTER[0] - 1.8 * inch
    shots = screenshots or []
    if shots:
        # One row, side by side. Each slot is an equal share of the width and
        # each image is capped in height, so a tall phone-card shot stays a
        # readable size instead of filling a page.
        gap = 0.18 * inch
        slot = (content_width - gap * (len(shots) - 1)) / len(shots)
        max_h = 4.4 * inch
        cells = []
        for shot in shots:
            img = Image(shot)
            # Read imageWidth/imageHeight before setting drawWidth/drawHeight —
            # reportlab lazily computes the former on first access and that
            # computation clobbers drawWidth/drawHeight back to native pixel
            # size, undoing an override made beforehand.
            w, h = img.imageWidth, img.imageHeight
            scale = min(slot / w, max_h / h)
            img.drawWidth, img.drawHeight = w * scale, h * scale
            cells.append(img)
        row = Table([cells], colWidths=[slot + gap] * len(cells), hAlign="LEFT")
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), gap),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(Spacer(1, 14))
        story.append(row)

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
