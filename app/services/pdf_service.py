import io
import logging
import re
from datetime import datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem

logger = logging.getLogger(__name__)

_UNSAFE_FILENAME = re.compile(r'[^A-Za-z0-9._-]+')


def _xml_text(value: Any) -> str:
    return escape(str(value), entities={'"': "&quot;", "'": "&apos;"})


def _normalize_str_list(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        return [s.strip() for s in raw.replace("\r\n", "\n").split("\n") if s.strip()]
    if isinstance(raw, (list, tuple)):
        out: list[str] = []
        for item in raw:
            if item is None:
                continue
            if isinstance(item, str):
                s = item.strip()
                if s:
                    out.append(s)
            elif isinstance(item, dict):
                name = item.get("name") or item.get("ingredient") or item.get("item")
                amt = item.get("amount") or item.get("quantity") or item.get("qty")
                if name and amt:
                    out.append(f"{name}: {amt}")
                elif name:
                    out.append(str(name).strip())
                else:
                    s = str(item).strip()
                    if s:
                        out.append(s)
            else:
                s = str(item).strip()
                if s:
                    out.append(s)
        return out
    s = str(raw).strip()
    return [s] if s else []


def _safe_filename(name: str) -> str:
    base = name.strip() or "recipe"
    base = _UNSAFE_FILENAME.sub("_", base).strip("._") or "recipe"
    return f"{base[:120]}.pdf"


def build_recipe_pdf(recipe: dict[str, Any]) -> tuple[bytes, str]:
    """
    Build a recipe PDF with ReportLab only. Returns (pdf_bytes, suggested_filename).
    """
    if not isinstance(recipe, dict):
        recipe = {}

    recipe_name = (recipe.get("recipe_name") or recipe.get("title") or "Recipe").strip() or "Recipe"
    cuisine = (recipe.get("cuisine") or "Not specified").strip() or "Not specified"
    confidence = recipe.get("_confidence", recipe.get("confidence_score"))
    if confidence is None:
        confidence_display = "N/A"
    else:
        try:
            n = float(confidence)
            confidence_display = f"{int(n)}%" if n == int(n) else f"{n:.1f}%"
        except (TypeError, ValueError):
            confidence_display = str(confidence)

    ingredients = _normalize_str_list(recipe.get("ingredients"))
    steps = _normalize_str_list(recipe.get("steps"))
    tips = _normalize_str_list(recipe.get("tips"))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=50,
        leftMargin=50,
        topMargin=50,
        bottomMargin=50,
        title=_xml_text(recipe_name),
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading1"],
        fontSize=24,
        textColor=colors.HexColor("#e85d04"),
        spaceAfter=18,
        fontName="Helvetica-Bold",
    )

    heading_style = ParagraphStyle(
        "HeadingStyle",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=colors.HexColor("#1a1a2e"),
        spaceBefore=14,
        spaceAfter=8,
        fontName="Helvetica-Bold",
    )

    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["Normal"],
        fontSize=11,
        spaceAfter=6,
        leading=15,
        fontName="Helvetica",
    )

    footer_style = ParagraphStyle(
        "FooterStyle",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#888888"),
        alignment=1,
        spaceBefore=28,
        fontName="Helvetica",
    )

    story: list[Any] = []
    story.append(Paragraph(_xml_text(recipe_name), title_style))

    story.append(Paragraph("Cuisine", heading_style))
    story.append(Paragraph(_xml_text(cuisine), body_style))

    story.append(Paragraph("Confidence Score", heading_style))
    story.append(Paragraph(_xml_text(str(confidence_display)), body_style))

    story.append(Paragraph("Ingredients", heading_style))
    if ingredients:
        bullet_items = [
            ListItem(Paragraph(_xml_text(ing), body_style), bulletColor=colors.HexColor("#e85d04"))
            for ing in ingredients
        ]
        story.append(ListFlowable(bullet_items, bulletType="bullet", start="circle"))
    else:
        story.append(Paragraph("<i>No ingredients provided.</i>", body_style))

    story.append(Paragraph("Steps", heading_style))
    if steps:
        numbered = [ListItem(Paragraph(_xml_text(step), body_style)) for step in steps]
        story.append(ListFlowable(numbered, bulletType="1"))
    else:
        story.append(Paragraph("<i>No steps provided.</i>", body_style))

    story.append(Paragraph("Tips", heading_style))
    if tips:
        tip_items = [
            ListItem(Paragraph(_xml_text(tip), body_style), bulletColor=colors.HexColor("#e85d04"))
            for tip in tips
        ]
        story.append(ListFlowable(tip_items, bulletType="bullet", start="circle"))
    else:
        story.append(Paragraph("<i>No tips for this recipe.</i>", body_style))

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    story.append(Spacer(1, 12))
    story.append(Paragraph("Timestamp", heading_style))
    story.append(Paragraph(_xml_text(timestamp), body_style))
    story.append(Paragraph("Generated by RasoiAI", footer_style))

    try:
        doc.build(story)
        pdf_bytes = buffer.getvalue()
    except Exception as e:
        logger.error("ReportLab PDF build failed: %s", e)
        raise
    finally:
        buffer.close()

    return pdf_bytes, _safe_filename(recipe_name)
