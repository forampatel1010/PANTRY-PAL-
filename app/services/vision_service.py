"""
Gemini vision: image → ingredient list. Output is passed through the same sanitizer as typed input.
"""

import json
import logging
import re
from typing import Any

from google.genai import types

from app.config.settings import settings
from app.services.ai_service import genai_client
from app.utils.sanitizer import sanitize_ingredients

logger = logging.getLogger(__name__)

_GEMINI_VISION_MODELS = (
    "gemini-2.0-flash",
    "gemini-2.5-flash",
)

_MAX_IMAGE_BYTES = 4 * 1024 * 1024
_ALLOWED_MIME = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


def _sniff_image_mime(data: bytes) -> str | None:
    """Infer image/* from magic bytes when browser sends wrong or empty Content-Type."""
    if len(data) < 12:
        return None
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


_VISION_PROMPT = """You are RasoiAI vision. Look at this food photo.

Task: list RAW EDIBLE INGREDIENTS that are visible or strongly implied (e.g. chopped vegetables in a bowl, fruits on a plate).

The image may be a studio or stock photo with a plain or checkerboard (transparency) background — ignore the background and only list the foods.

Rules:
- Use simple English kitchen names: tomato, onion, potato, coriander, rice, egg, paneer.
- Lowercase single words or two-word items only (e.g. bell pepper, olive oil).
- No brands, packaging, utensils, hands, or non-food objects.
- Order by confidence (highest first). At most 12 items.
- If the image is blurry or unclear, still output your 3–6 best probabilistic FOOD guesses (never return an empty list from the model side).

Return ONLY valid JSON with this exact shape:
{"ingredients": ["item1", "item2"]}
"""


def _parse_ingredient_json(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if not raw:
        return []
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        raw = m.group(0)
    data = json.loads(raw)
    items = data.get("ingredients")
    if items is None:
        items = data.get("items")
    if isinstance(items, str):
        items = [x.strip() for x in items.split(",") if x.strip()]
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for x in items:
        if x is None:
            continue
        s = str(x).strip()
        if s:
            out.append(s)
    return out


async def _call_vision(image_bytes: bytes, mime_type: str) -> str:
    model_order: list[str] = []
    if settings.GEMINI_MODEL:
        model_order.append(settings.GEMINI_MODEL)
    model_order.extend(m for m in _GEMINI_VISION_MODELS if m not in model_order)

    parts = [
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        types.Part.from_text(text=_VISION_PROMPT),
    ]
    contents = [types.Content(role="user", parts=parts)]

    last_err: Exception | None = None
    for model in model_order:
        try:
            response = await genai_client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.25,
                    max_output_tokens=1024,
                    response_mime_type="application/json",
                ),
            )
            text = response.text or ""
            logger.info("Vision OK model=%s chars=%d", model, len(text))
            return text
        except Exception as e:
            last_err = e
            logger.warning("Vision model %s failed: %s", model, e)
    if last_err:
        raise last_err
    raise RuntimeError("No vision model available")


async def detect_ingredients_from_image(
    image_bytes: bytes,
    mime_type: str,
) -> dict[str, Any]:
    """
    Returns:
      { "ok": True, "ingredients": [...], "noise_removed": [...], "note": str|None }
      or { "ok": False, "message": str }
    """
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        return {"ok": False, "message": "Image too large (max 4 MB). Try a smaller photo."}

    mt = (mime_type or "application/octet-stream").split(";")[0].strip().lower()
    if mt not in _ALLOWED_MIME:
        sniffed = _sniff_image_mime(image_bytes)
        if sniffed:
            mt = sniffed
            logger.info("Vision: corrected MIME from %r to %s via magic bytes", mime_type, mt)
        else:
            return {
                "ok": False,
                "message": f"Unsupported image type ({mt or 'unknown'}). Use JPEG, PNG, WEBP, or GIF.",
            }

    if not settings.GEMINI_API_KEY:
        return {"ok": False, "message": "Image detection needs GEMINI_API_KEY in server environment."}

    try:
        raw_text = await _call_vision(image_bytes, mt)
        raw_list = _parse_ingredient_json(raw_text)
    except json.JSONDecodeError as e:
        logger.warning("Vision JSON parse failed: %s", e)
        return {"ok": False, "message": "Could not read ingredient list from the model. Try another photo."}
    except Exception as e:
        logger.exception("Vision call failed")
        return {"ok": False, "message": f"Image analysis failed: {e!s}"}

    cleaned, noise = sanitize_ingredients(raw_list)
    note: str | None = None
    if noise:
        note = f"Filtered non-ingredients: {', '.join(noise[:8])}{'…' if len(noise) > 8 else ''}"

    if not cleaned:
        return {
            "ok": False,
            "message": "No recognizable food ingredients found in this image. Try a clearer close-up of the food.",
        }

    if len(raw_list) > len(cleaned) + 2:
        note = (note + " " if note else "") + "Some guesses were removed by safety filters."

    return {"ok": True, "ingredients": cleaned, "noise_removed": noise, "note": note}
