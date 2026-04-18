import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

MAX_INGREDIENTS = 15

NON_FOOD_WORDS = {
    "plastic", "metal", "glass", "paper", "cardboard", "wood", "stone",
    "rock", "sand", "soil", "dirt", "mud", "clay", "rubber", "fabric",
    "cloth", "leather", "wool", "cotton", "silk", "soap", "detergent",
    "shampoo", "bleach", "acid", "chemical", "paint", "ink", "glue",
    "pen", "pencil", "eraser", "staple", "nail", "screw", "bolt",
    "wire", "battery", "charger", "phone", "laptop", "tablet", "remote",
    "key", "coin", "button", "zipper", "thread", "needle", "scissors",
    "table", "chair", "floor", "wall", "ceiling", "window", "door",
}


def sanitize_ingredients(ingredients: list[str]) -> tuple[list[str], list[str]]:
    """
    Returns (valid_ingredients, removed_ingredients).
    Filters duplicates, non-food items, and enforces max limit.
    """
    seen: set[str] = set()
    cleaned: list[str] = []
    removed: list[str] = []

    for item in ingredients:
        normalized = item.lower().strip()
        normalized = re.sub(r"[^a-z0-9\s]", "", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()

        if not normalized:
            removed.append(item.strip())
            continue

        if normalized in NON_FOOD_WORDS:
            logger.info("🗑️ Sanitizer removed non-food item: '%s'", normalized)
            removed.append(normalized)
            continue

        if normalized in seen:
            continue  # silently deduplicate

        seen.add(normalized)
        cleaned.append(normalized)

        if len(cleaned) == MAX_INGREDIENTS:
            break

    return cleaned, removed
