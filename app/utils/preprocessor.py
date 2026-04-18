"""
preprocessor.py — Input Intelligence Layer for RasoiAI

Responsibilities:
  - Spell correction via alias map
  - Veg filtering with removal tracking
  - Ingredient clustering (base / protein / flavor / vegetable / spice / fruit / dairy)
  - Synergy & conflict detection
  - Best-subset selection for illogical combinations
"""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class PreprocessResult:
    """Full output of the preprocessing pipeline."""
    valid_ingredients: list[str]          # Final clean ingredient list for AI
    corrected: dict[str, str]             # Spelling corrections applied {original: corrected}
    veg_removed: list[str]                # Ingredients stripped by veg filter
    noise_removed: list[str]              # Non-food items already removed by sanitizer
    categories: dict[str, list[str]]      # Ingredient → category mapping
    anchor_cluster: str                   # Primary dish-type cluster ("base+protein", "fruit+dairy", etc.)
    synerry_hints: list[str]              # Relevant synergy notes for prompt
    conflict_hints: list[str]             # Relevant conflict warnings for prompt
    variety_token: str                    # Anti-repetition hint injected into prompt


# ─────────────────────────────────────────────
# Spell Correction
# ─────────────────────────────────────────────

def _spell_correct(ingredients: list[str], rules: dict) -> tuple[list[str], dict[str, str]]:
    """
    Correct misspelled ingredients using the alias map in recipe_rules.json.
    Returns (corrected_list, corrections_made).
    """
    aliases: dict[str, str] = rules.get("ingredient_aliases", {})
    corrected_list = []
    corrections_made = {}

    for ing in ingredients:
        lower = ing.strip().lower()
        if lower in aliases:
            corrected = aliases[lower]
            corrections_made[lower] = corrected
            corrected_list.append(corrected)
            logger.info("✏️ Spell corrected: '%s' → '%s'", lower, corrected)
        else:
            corrected_list.append(lower)

    return corrected_list, corrections_made


# ─────────────────────────────────────────────
# Veg Filter
# ─────────────────────────────────────────────

def _apply_veg_filter(ingredients: list[str], rules: dict) -> tuple[list[str], list[str]]:
    """
    Returns (allowed, removed) after filtering non-veg ingredients.
    """
    non_veg_kw: set[str] = {k.lower() for k in rules.get("veg_rules", {}).get("non_veg_keywords", [])}
    allowed, removed = [], []
    for ing in ingredients:
        if any(kw in ing.lower() for kw in non_veg_kw):
            removed.append(ing)
            logger.warning("🥗 Veg filter removed: '%s'", ing)
        else:
            allowed.append(ing)
    return allowed, removed


# ─────────────────────────────────────────────
# Ingredient Clustering
# ─────────────────────────────────────────────

def _classify_ingredients(ingredients: list[str], rules: dict) -> dict[str, list[str]]:
    """
    Classify each ingredient into its category (base, protein, flavor, vegetable, spice, fruit, dairy).
    Returns a dict: {ingredient: category}.
    """
    categories_map: dict[str, list[str]] = rules.get("ingredient_categories", {})
    result = {}

    for ing in ingredients:
        ing_lower = ing.lower()
        found = False
        for category, members in categories_map.items():
            if any(m.lower() in ing_lower or ing_lower in m.lower() for m in members):
                result[ing] = category
                found = True
                break
        if not found:
            result[ing] = "other"

    return result


def _determine_anchor_cluster(categories: dict[str, list[str]], rules: dict) -> str:
    """
    Determine the primary dish type based on ingredient categories.
    Uses the combination_logic priority from rules.
    """
    present = set(categories.values())
    priority = rules.get("combination_logic", {}).get("priority", [])

    base = "base" in present
    protein = "protein" in present
    flavor = "flavor" in present
    fruit = "fruit" in present
    dairy = "dairy" in present
    vegetable = "vegetable" in present

    if base and protein:
        return "base+protein → full meal (rice bowl, sandwich, egg toast)"
    if fruit and dairy:
        return "fruit+dairy → drink or dessert (smoothie, shake, kheer)"
    if base and flavor:
        return "base+flavor → snack (toast, buttered roti, oats bowl)"
    if protein and vegetable:
        return "protein+vegetable → curry or stir-fry (egg bhurji, paneer sabzi)"
    if protein:
        return "protein alone → focused protein dish (omelette, dal, paneer bhurji)"
    if vegetable:
        return "vegetable → sabzi or soup"
    if fruit:
        return "fruit alone → dessert or raw snack"
    if base:
        return "base alone → simple bread/rice dish"

    return "mixed → use best judgment to combine ingredients"


# ─────────────────────────────────────────────
# Synergy & Conflict Detection
# ─────────────────────────────────────────────

def _get_synergy_hints(ingredients: list[str], rules: dict) -> list[str]:
    hints = []
    ing_set = {i.lower() for i in ingredients}
    for pair in rules.get("synergy_pairs", []):
        pair_set = {p.lower() for p in pair["ingredients"]}
        if pair_set & ing_set:  # any overlap
            hints.append(pair.get("note", ""))
    return [h for h in hints if h]


def _get_conflict_hints(ingredients: list[str], rules: dict) -> list[str]:
    hints = []
    ing_set = {i.lower() for i in ingredients}
    for pair in rules.get("conflict_pairs", []):
        pair_set = {p.lower() for p in pair["ingredients"]}
        if pair_set.issubset(ing_set):  # ALL conflict items present
            hints.append(pair.get("note", ""))
    return [h for h in hints if h]


# ─────────────────────────────────────────────
# Anti-repetition token
# ─────────────────────────────────────────────

import random

_VARIETY_TOKENS = [
    "Try a creative variation — avoid the most obvious dish.",
    "Surprise the user with a less common but delicious preparation.",
    "Choose a dish that feels fresh and different from the standard version.",
    "Pick a regional or lesser-known variation of the expected dish.",
    "Think about textures and presentation — make it interesting.",
    "Consider a quick and simple version that still tastes great.",
]

def _pick_variety_token() -> str:
    return random.choice(_VARIETY_TOKENS)


# ─────────────────────────────────────────────
# Main Preprocessor Entry Point
# ─────────────────────────────────────────────

def preprocess(
    raw_ingredients: list[str],
    rules: dict,
    is_veg: bool = False,
    noise_removed: list[str] = None,
) -> PreprocessResult:
    """
    Full preprocessing pipeline:
      1. Spell correction
      2. Veg filtering (if is_veg=True)
      3. Ingredient classification
      4. Anchor cluster determination
      5. Synergy & conflict detection
      6. Variety token generation

    Returns a PreprocessResult with everything the AI prompt needs.
    """
    noise_removed = noise_removed or []

    # Step 1 — Spell correction
    corrected_ings, corrections = _spell_correct(raw_ingredients, rules)

    # Step 2 — Veg filter
    if is_veg:
        valid_ings, veg_removed = _apply_veg_filter(corrected_ings, rules)
    else:
        valid_ings, veg_removed = corrected_ings, []

    # Step 3 — Classification
    categories = _classify_ingredients(valid_ings, rules)

    # Step 4 — Anchor cluster
    anchor = _determine_anchor_cluster(categories, rules)

    # Step 5 — Synergy & conflict
    synergy_hints = _get_synergy_hints(valid_ings, rules)
    conflict_hints = _get_conflict_hints(valid_ings, rules)

    # Step 6 — Variety token
    variety = _pick_variety_token()

    logger.info(
        "🔬 Preprocessor | input=%s | corrected=%s | veg_removed=%s | anchor='%s'",
        raw_ingredients, corrections, veg_removed, anchor
    )

    return PreprocessResult(
        valid_ingredients=valid_ings,
        corrected=corrections,
        veg_removed=veg_removed,
        noise_removed=noise_removed,
        categories=categories,
        anchor_cluster=anchor,
        synerry_hints=synergy_hints,
        conflict_hints=conflict_hints,
        variety_token=variety,
    )
