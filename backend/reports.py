import csv
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def rows_to_csv_bytes(headers: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def build_pdf_report(
    title: str,
    subtitle: str,
    metadata_pairs: list[tuple[str, str]],
    headers: list[str],
    rows: list[list],
    notes: str = "",
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(letter),
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.5 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        textColor=colors.HexColor("#475569"),
        spaceAfter=12,
    )
    note_style = ParagraphStyle(
        "ReportNotes",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8.5,
        textColor=colors.HexColor("#64748b"),
        spaceBefore=10,
    )

    elements = [
        Paragraph(f"RetailSense AI — {title}", title_style),
        Paragraph(subtitle, sub_style),
    ]

    if metadata_pairs:
        meta_rows = [[f"{k}: {v}" for k, v in metadata_pairs[i : i + 3]] for i in range(0, len(metadata_pairs), 3)]
        for r in meta_rows:
            while len(r) < 3:
                r.append("")
        meta_table = Table(meta_rows, colWidths=[3.3 * inch, 3.3 * inch, 3.3 * inch])
        meta_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                    ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1e293b")),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("PADDING", (0, 0), (-1, -1), 6),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ]
            )
        )
        elements.append(meta_table)
        elements.append(Spacer(1, 14))

    table_data = [headers] + [[str(c) for c in row] for row in rows[:200]]
    col_count = max(1, len(headers))
    avail_width = 10.0 * inch
    col_w = avail_width / col_count

    tbl = Table(table_data, colWidths=[col_w] * col_count, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
                ("PADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    elements.append(tbl)

    footer_text = notes or f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} by RetailSense AI."
    elements.append(Paragraph(footer_text, note_style))

    doc.build(elements)
    return buf.getvalue()
