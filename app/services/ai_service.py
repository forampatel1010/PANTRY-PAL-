import json
import logging
import os
import random
import re
import threading
from google import genai
from google.genai import types
from collections import defaultdict
from functools import lru_cache
from app.config.settings import settings
from app.models.recipe_model import RecipeRequest, RecipeResponse, Nutrition
from app.utils.preprocessor import preprocess, PreprocessResult

logger = logging.getLogger(__name__)

# Configure the Gemini SDK at the module level
genai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
TIMEOUT = 30.0

# Tried in order until one succeeds (avoids 404 when a model ID is retired).
_GEMINI_MODEL_FALLBACKS = (
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    
)

# ─────────────────────────────────────────────
# Persistent Memory-Based Anti-Repetition Store
# ─────────────────────────────────────────────
_MEMORY_FILE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "recipe_memory.json")
)
_recipe_memory: dict[str, list[str]] = {}
_memory_lock = threading.Lock()
MAX_MEMORY_PER_KEY = 5


def _load_persistent_memory() -> None:
    """Load recipe memory from disk into _recipe_memory on startup."""
    global _recipe_memory
    try:
        if os.path.exists(_MEMORY_FILE) and os.path.getsize(_MEMORY_FILE) > 2:
            with open(_MEMORY_FILE, "r", encoding="utf-8") as f:
                _recipe_memory = json.load(f)
            logger.info("📂 Loaded recipe memory (%d keys) from disk.", len(_recipe_memory))
        else:
            _recipe_memory = {}
    except Exception as e:
        logger.warning("⚠️ Could not load recipe_memory.json: %s — starting fresh.", e)
        _recipe_memory = {}


def _save_persistent_memory() -> None:
    """Atomically save current _recipe_memory to disk (called within _memory_lock)."""
    try:
        tmp_path = _MEMORY_FILE + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(_recipe_memory, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, _MEMORY_FILE)  # atomic on POSIX; near-atomic on Windows
    except Exception as e:
        logger.warning("⚠️ Could not persist recipe memory: %s", e)


# Load on module import
_load_persistent_memory()


def _memory_key(ingredients: list[str]) -> str:
    """Stable key from sorted ingredient list."""
    return "+".join(sorted(i.strip().lower() for i in ingredients))


def _get_recent_recipes(ingredients: list[str]) -> list[str]:
    key = _memory_key(ingredients)
    with _memory_lock:
        return list(_recipe_memory.get(key, []))


def _remember_recipe(ingredients: list[str], recipe_name: str) -> None:
    """Store recipe name in memory and persist to disk."""
    key = _memory_key(ingredients)
    with _memory_lock:
        history = _recipe_memory.setdefault(key, [])
        if recipe_name not in history:
            history.append(recipe_name)
        if len(history) > MAX_MEMORY_PER_KEY:
            history.pop(0)  # evict oldest
        _save_persistent_memory()


def _is_repeated(ingredients: list[str], recipe_name: str) -> bool:
    recent = _get_recent_recipes(ingredients)
    return recipe_name.strip().lower() in [r.lower() for r in recent]


# ─────────────────────────────────────────────
# Dataset Loader (cached)
# ─────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_rules() -> dict:
    path = os.path.join(os.path.dirname(__file__), "..", "data", "recipe_rules.json")
    try:
        with open(os.path.normpath(path), "r", encoding="utf-8") as f:
            data = json.load(f)
            logger.info("✅ recipe_rules.json loaded.")
            return data
    except Exception as e:
        logger.warning("⚠️ Could not load recipe_rules.json: %s", e)
        return {}


# ─────────────────────────────────────────────
# Confidence Scoring
# ─────────────────────────────────────────────

def _compute_confidence(
    parsed: dict,
    user_ingredients: list[str],
    pre: PreprocessResult,
    is_veg: bool,
    veg_compliant: bool,
    validation_passed: bool,
    anchor_usage_ratio: float,
) -> int:
    """
    Compute a 0–100 confidence score for recipe output quality.

    Weights:
      ingredient_match  → 35 pts  (how many user ingredients appear in output)
      anchor_usage      → 30 pts  (how well the anchor cluster is used)
      veg_compliance    → 20 pts  (0 or full points; irrelevant if not veg mode)
      validation_pass   → 15 pts  (50% ingredient threshold met)
    """
    recipe_text = " ".join([
        parsed.get("recipe_name", "").lower(),
        *[i.lower() for i in parsed.get("ingredients", [])],
        *[s.lower() for s in parsed.get("steps", [])],
    ])

    # Ingredient match ratio (35 pts)
    if user_ingredients:
        matched = sum(
            1 for ing in user_ingredients
            if ing.strip().lower().split()[0] in recipe_text
        )
        ing_ratio = matched / len(user_ingredients)
    else:
        ing_ratio = 1.0
    ing_score = round(ing_ratio * 35)

    # Anchor cluster usage (30 pts)
    anchor_score = round(anchor_usage_ratio * 30)

    # Veg compliance (20 pts — full points if not veg mode or if compliant)
    veg_score = 20 if (not is_veg or veg_compliant) else 0

    # Validation pass (15 pts)
    val_score = 15 if validation_passed else 0

    total = ing_score + anchor_score + veg_score + val_score
    return min(total, 100)


# ─────────────────────────────────────────────
# Anchor Cluster Ingredient Extractor
# ─────────────────────────────────────────────

def _get_anchor_ingredients(pre: PreprocessResult) -> list[str]:
    """
    Extract the ingredients that belong to the primary anchor cluster categories.
    Anchor cluster is like "base+protein → full meal" — so we extract base+protein members.
    """
    anchor = pre.anchor_cluster.lower()
    primary_cats: set[str] = set()

    category_keywords = {
        "base": "base",
        "protein": "protein",
        "fruit": "fruit",
        "dairy": "dairy",
        "vegetable": "vegetable",
        "spice": "spice",
        "flavor": "flavor",
    }
    for cat, kw in category_keywords.items():
        if kw in anchor:
            primary_cats.add(cat)

    return [
        ing for ing, cat in pre.categories.items()
        if cat in primary_cats
    ]


def _compute_anchor_usage(parsed: dict, anchor_ingredients: list[str]) -> float:
    """Returns fraction of anchor ingredients present in the output (0.0–1.0)."""
    if not anchor_ingredients:
        return 1.0
    recipe_text = " ".join([
        parsed.get("recipe_name", "").lower(),
        *[i.lower() for i in parsed.get("ingredients", [])],
        *[s.lower() for s in parsed.get("steps", [])],
    ])
    matched = sum(
        1 for ing in anchor_ingredients
        if ing.strip().lower().split()[0] in recipe_text
    )
    return matched / len(anchor_ingredients)


# ─────────────────────────────────────────────
# Used / Ignored Ingredient Analysis
# ─────────────────────────────────────────────

def _analyse_ingredient_usage(parsed: dict, user_ingredients: list[str]) -> tuple[list[str], list[str]]:
    """Returns (used_ingredients, ignored_ingredients)."""
    recipe_text = " ".join([
        parsed.get("recipe_name", "").lower(),
        *[i.lower() for i in parsed.get("ingredients", [])],
        *[s.lower() for s in parsed.get("steps", [])],
    ])
    used, ignored = [], []
    for ing in user_ingredients:
        core = ing.strip().lower().split()[0]
        if core in recipe_text:
            used.append(ing)
        else:
            ignored.append(ing)
    return used, ignored


# ─────────────────────────────────────────────
# Few-shot Example Selector
# ─────────────────────────────────────────────

def _get_relevant_examples(ingredients: list[str], rules: dict) -> str:
    examples = rules.get("few_shot_examples", [])
    user_set = {i.strip().lower() for i in ingredients}
    matched = []
    for ex in examples:
        ex_set = {k.lower() for k in ex.get("ingredients", [])}
        if ex_set & user_set:
            dishes = ", ".join(ex["dishes"])
            ing_str = " + ".join(ex["ingredients"])
            matched.append(f"  • {ing_str} → {dishes}  [{ex.get('note', '')}]")
    if not matched:
        return ""
    return "REAL-WORLD EXAMPLES (inspiration only):\n" + "\n".join(matched[:5])


# ─────────────────────────────────────────────
# Food Style Hint
# ─────────────────────────────────────────────

def _get_style_hint(food_style: str | None, rules: dict) -> str:
    if not food_style:
        return ""
    for key, val in rules.get("food_style_hints", {}).items():
        if key.lower() == food_style.strip().lower():
            return (
                f"FOOD STYLE: {key}\n"
                f"  Flavor profile: {val.get('flavor', '')}\n"
                f"  Avoid: {val.get('avoid', '')}\n"
                f"  Prefer: {val.get('prefer', '')}"
            )
    return f"FOOD STYLE: {food_style} — adapt naturally to this style."


def _customization_notes(prefs) -> list[str]:
    """Structured taste / diet flags beyond spice and quick_mode."""
    if prefs is None:
        return []
    lines: list[str] = []
    if getattr(prefs, "oil_level", "normal") == "low":
        lines.append(
            "• Oil level LOW — use minimal oil; prefer steaming, grilling, dry roasting, or shallow sauté."
        )
    if getattr(prefs, "high_protein", False):
        lines.append(
            "• HIGH PROTEIN — maximize protein density (paneer, eggs, dal, legumes, lean meat if allowed); "
            "mention protein in tips where helpful."
        )
    if getattr(prefs, "low_calorie", False):
        lines.append(
            "• LOWER CALORIE — lighter cooking, smaller amounts of cream/butter/sugar, favour soups, grills, and veg-forward plates."
        )
    if getattr(prefs, "more_vegetables", False):
        lines.append(
            "• EXTRA VEGETABLES — add more seasonal vegetables to the dish (names + how they are used in steps)."
        )
    return lines


def _modification_block(data: RecipeRequest, ingredients_str: str) -> str:
    """When user refines an existing card, anchor on pantry + prior recipe snapshot."""
    br = data.base_recipe
    if not br:
        return ""
    try:
        snap = json.dumps(br, ensure_ascii=False)
    except (TypeError, ValueError):
        snap = str(br)
    if len(snap) > 8000:
        snap = snap[:8000] + "…"
    mr = (data.modification_request or "").strip() or "(apply flags and regional style only)"
    return f"""
══════════════════════════════════════════════════════
RECIPE REFINEMENT — EDIT / PERSONALIZE
══════════════════════════════════════════════════════
The user wants a MODIFIED version of the recipe below (not a totally unrelated dish).
Keep these pantry ingredients as the core: [{ingredients_str}]
You may add reasonable supporting items for the requested style.

CURRENT RECIPE SNAPSHOT:
{snap}

USER NOTES: {mr}

Return fresh JSON: new or updated recipe_name, revised ingredients and steps that reflect the changes.
"""


# ─────────────────────────────────────────────
# Prompt Builder
# ─────────────────────────────────────────────

def _build_prompt(
    data: RecipeRequest,
    pre: PreprocessResult,
    anchor_ingredients: list[str],
    strict_retry: bool = False,
    avoid_recipes: list[str] = None,
) -> str:
    rules = _load_rules()
    prefs = data.preferences
    ingredients = pre.valid_ingredients
    ingredients_str = ", ".join(ingredients) if ingredients else "(none)"
    avoid_recipes = avoid_recipes or []

    # Preference notes
    budget_note = "• Use low-cost, easily available ingredients." if prefs.budget_mode else ""
    health_note = "• Healthy: low oil, low sugar, high fibre." if prefs.health_mode else ""
    quick_note  = "• Total cooking time MUST be under 30 minutes." if prefs.quick_mode else ""
    spice_note  = f"• Spice level: {prefs.spice_level}."
    cuisine_note = f"• Cuisine preference: {data.cuisine or 'Indian (Gujarati first)'}."
    cust_lines = _customization_notes(prefs)
    cust_block = "CUSTOMIZATION:\n" + "\n".join(cust_lines) if cust_lines else ""
    mod_block = _modification_block(data, ingredients_str)

    # Dataset blocks
    examples_block = _get_relevant_examples(ingredients, rules)
    style_block    = _get_style_hint(data.food_style, rules)

    # Category classification block
    category_lines = "\n".join(f"  - {ing} → [{cat}]" for ing, cat in pre.categories.items())
    category_block = f"INGREDIENT CLASSIFICATION:\n{category_lines}" if category_lines else ""

    # Anchor cluster enforcement
    anchor_str = ", ".join(anchor_ingredients) if anchor_ingredients else ingredients_str
    anchor_block = (
        f"ANCHOR CLUSTER (PRIMARY FOCUS): {pre.anchor_cluster}\n"
        f"ANCHOR INGREDIENTS (MUST USE ≥70%): [{anchor_str}]\n"
        f"Secondary ingredients may be used for flavoring but are optional."
    )

    # Synergy & conflict
    synergy_block = ""
    if pre.synerry_hints:
        synergy_block = "SYNERGY NOTES:\n" + "\n".join(f"  ✓ {h}" for h in pre.synerry_hints)

    conflict_block = ""
    if pre.conflict_hints:
        conflict_block = "CONFLICT NOTES:\n" + "\n".join(f"  ⚠ {h}" for h in pre.conflict_hints)

    # Spell correction note
    correction_block = ""
    if pre.corrected:
        fixes = ", ".join(f"'{k}' → '{v}'" for k, v in pre.corrected.items())
        correction_block = f"AUTO-CORRECTED INGREDIENTS: {fixes}"

    # Veg constraint
    veg_block = ""
    if pre.veg_removed:
        veg_block = (
            f"⚠️ VEG MODE ACTIVE — EXCLUDED (do NOT use, even as optional or stock): "
            f"{', '.join(pre.veg_removed)}"
        )

    # Anti-repetition block
    avoid_block = ""
    if avoid_recipes:
        avoid_str = ", ".join(f'"{r}"' for r in avoid_recipes)
        avoid_block = (
            f"🔁 ANTI-REPETITION — You MUST NOT generate any of these dishes (already shown to user):\n"
            f"  FORBIDDEN: [{avoid_str}]\n"
            f"  Generate a DIFFERENT recipe using the same ingredients."
        )

    # Variety token
    variety_block = f"VARIETY DIRECTIVE: {pre.variety_token}"

    # Retry override
    retry_block = ""
    if strict_retry:
        retry_block = (
            "\n🚨 FINAL ATTEMPT — PREVIOUS OUTPUT REJECTED:\n"
            "   Your last recipe did NOT use enough anchor ingredients.\n"
            f"  You MUST use AT LEAST 70% of anchor ingredients: [{anchor_str}]\n"
            "   Use them explicitly in BOTH ingredients list AND cooking steps.\n"
        )

    return f"""
You are RasoiAI — an expert AI cooking assistant that reasons before generating.
{retry_block}
══════════════════════════════════════════════════════
[1] INGREDIENT INPUT
══════════════════════════════════════════════════════
Full ingredient set: [{ingredients_str}]
{correction_block}
{veg_block}
{category_block}

══════════════════════════════════════════════════════
[2] ANCHOR CLUSTER — STRICT ENFORCEMENT
══════════════════════════════════════════════════════
{anchor_block}

══════════════════════════════════════════════════════
[3] CONTEXT & PREFERENCES
══════════════════════════════════════════════════════
{cuisine_note}
{spice_note}
{budget_note}
{health_note}
{quick_note}
{cust_block}
{style_block}
{mod_block}

══════════════════════════════════════════════════════
[4] KNOWLEDGE BASE
══════════════════════════════════════════════════════
{examples_block}
{synergy_block}
{conflict_block}
{avoid_block}
{variety_block}

══════════════════════════════════════════════════════
[5] INTERNAL REASONING — MANDATORY
══════════════════════════════════════════════════════
Think step-by-step (do NOT include reasoning in output):

A. Start from the ANCHOR CLUSTER — choose a dish that centres on those ingredients.
B. Add secondary ingredients as support (flavoring, garnish, base).
C. Self-check: are ≥70% anchor ingredients used in both steps AND ingredients list?
D. Is this dish different from the forbidden list above?
E. Does it comply with veg mode and food style?
F. Only THEN generate final JSON.

══════════════════════════════════════════════════════
[6] STRICT RULES
══════════════════════════════════════════════════════
1. ANCHOR INGREDIENTS must appear in BOTH the ingredients list AND cooking steps (≥70%).
2. NEVER output a dish from the FORBIDDEN list above.
3. NEVER include non-veg ingredients if veg mode is active (even as notes or stock).
4. NEVER use "Aloo Sabzi" or other generics unless potato/aloo was explicitly given.
5. If ingredients cannot produce any valid dish:
   Return ONLY: {{"error": true, "message": "No valid recipe possible with given ingredients"}}
6. Steps must include: time (X min), heat/flame level (low/medium/high or "no heat"), visible result.
7. Use Indian units: katori, tsp, tbsp, cup (200ml).

══════════════════════════════════════════════════════
[7] OUTPUT — RETURN ONLY VALID JSON, NO MARKDOWN
══════════════════════════════════════════════════════
{{
  "recipe_name": "string",
  "cuisine": "string",
  "ingredients": ["string"],
  "steps": [
    "Step 1 (2 min | medium flame): Heat oil until it shimmers and water droplets sizzle.",
    "Step 2 (5 min | low flame): Add onions; cook until translucent and edges turn golden."
  ],
  "time_required": "string (e.g. 25 minutes)",
  "difficulty": "easy | medium | hard",
  "tips": ["string"],
  "substitutions": {{"ingredient": "substitute"}},
  "nutrition": {{
    "calories": "string",
    "protein": "string",
    "carbs": "string",
    "fat": "string",
    "fiber": "string"
  }},
  "search_queries": ["string (YouTube/Google search term)"]
}}
""".strip()


# ─────────────────────────────────────────────
# JSON Parser + Schema Validator
# ─────────────────────────────────────────────


def _parse_and_validate(raw: str) -> dict:
    raw = raw.strip()
    
    # Try regex extraction for resilient parsing if markdown block is imperfect
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        raw = match.group(0)
    else:
        # Strict markdown strip fallback
        if raw.startswith("```"):
            raw = "\n".join(line for line in raw.splitlines() if not line.strip().startswith("```"))

    data = json.loads(raw)
    required = {
        "recipe_name", "cuisine", "ingredients", "steps",
        "time_required", "difficulty", "tips", "substitutions",
        "nutrition", "search_queries",
    }
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing fields: {missing}")
    if not data.get("ingredients"):
        raise ValueError("Empty ingredients.")
    if not data.get("steps"):
        raise ValueError("Empty steps.")
    return data


# ─────────────────────────────────────────────
# Ingredient Relevance (steps + ingredients text)
# ─────────────────────────────────────────────

def _validate_ingredient_relevance(parsed: dict, user_ingredients: list[str]) -> tuple[bool, float]:
    if not user_ingredients:
        return True, 1.0
    recipe_text = " ".join([
        parsed.get("recipe_name", "").lower(),
        *[i.lower() for i in parsed.get("ingredients", [])],
        *[s.lower() for s in parsed.get("steps", [])],
    ])
    matched = sum(
        1 for ing in user_ingredients
        if ing.strip().lower().split()[0] in recipe_text
    )
    ratio = matched / len(user_ingredients)
    return ratio >= 0.5, ratio


# ─────────────────────────────────────────────
# P0: Veg Compliance — checks OUTPUT
# ─────────────────────────────────────────────

def _validate_veg_compliance(parsed: dict, rules: dict) -> tuple[bool, list[str]]:
    non_veg_kw = {k.lower() for k in rules.get("veg_rules", {}).get("non_veg_keywords", [])}
    full_text = " ".join([
        parsed.get("recipe_name", ""),
        *parsed.get("ingredients", []),
        *parsed.get("steps", []),
        *parsed.get("tips", []),
    ]).lower()
    violations = [kw for kw in non_veg_kw if kw in full_text]
    return len(violations) == 0, violations


# ─────────────────────────────────────────────
# Gemini API Caller
# ─────────────────────────────────────────────

async def _call_gemini(
    prompt: str,
    temperature: float = 0.6,
    *,
    max_output_tokens: int = 2048,
) -> str:
    model_order: list[str] = []
    if settings.GEMINI_MODEL:
        model_order.append(settings.GEMINI_MODEL)
    model_order.extend(m for m in _GEMINI_MODEL_FALLBACKS if m not in model_order)

    last_err: Exception | None = None
    for model in model_order:
        try:
            response = await genai_client.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=int(max_output_tokens),
                    response_mime_type="application/json",
                ),
            )
            response_text = response.text
            logger.debug("Gemini OK model=%s preview=%s", model, (response_text or "")[:400])
            return response_text
        except Exception as e:
            last_err = e
            logger.warning("Gemini model %s failed: %s — trying next.", model, e)
    if last_err:
        logger.error("All Gemini models failed: %s", last_err)
        raise last_err
    raise RuntimeError("No Gemini model configured.")


# ─────────────────────────────────────────────
# Build Validated RecipeResponse
# ─────────────────────────────────────────────

def _build_recipe_response(parsed: dict) -> dict:
    nutrition = Nutrition(**parsed.get("nutrition", {}))
    recipe = RecipeResponse(
        recipe_name=parsed["recipe_name"],
        cuisine=parsed["cuisine"],
        ingredients=parsed["ingredients"],
        steps=parsed["steps"],
        time_required=parsed["time_required"],
        difficulty=parsed["difficulty"],
        tips=parsed.get("tips", []),
        substitutions=parsed.get("substitutions", {}),
        nutrition=nutrition,
        search_queries=parsed.get("search_queries", []),
    )
    return recipe.model_dump()


# ─────────────────────────────────────────────
# Confidence-Based Quality Retry
# ─────────────────────────────────────────────

def _build_quality_retry_prompt(ingredients: list[str], prev_recipe_name: str, anchor_cluster: str) -> str:
    ing_str = ", ".join(ingredients)
    return f"""
You are RasoiAI. Your previous recipe '{prev_recipe_name}' for ingredients [{ing_str}] scored LOW on quality.

Fix these specific issues:
1. Use MORE of the provided ingredients BY NAME in both the ingredients list AND cooking steps.
2. Ensure the dish logically fits the ingredient cluster: {anchor_cluster}
3. Add more detailed, realistic cooking steps with time and flame level.
4. Make the recipe feel complete and professional — not generic.

Ingredients to use: [{ing_str}]

Return ONLY valid JSON with the same schema (no markdown):
{{
  "recipe_name": "string",
  "cuisine": "string",
  "ingredients": ["string"],
  "steps": ["Step N (X min | flame or no heat): instruction with visible result."],
  "time_required": "string",
  "difficulty": "easy | medium | hard",
  "tips": ["string"],
  "substitutions": {{"ingredient": "substitute"}},
  "nutrition": {{"calories": "string", "protein": "string", "carbs": "string", "fat": "string", "fiber": "string"}},
  "search_queries": ["string"]
}}
""".strip()


async def _quality_retry(
    ingredients: list[str],
    prev_parsed: dict,
    anchor_cluster: str,
) -> dict | None:
    """One extra Gemini call to improve a low-confidence response. Returns parsed dict or None."""
    try:
        prompt = _build_quality_retry_prompt(ingredients, prev_parsed.get("recipe_name", ""), anchor_cluster)
        raw = await _call_gemini(prompt, temperature=0.5)
        return _parse_and_validate(raw)
    except Exception as e:
        logger.warning("⚠️ Quality retry failed: %s", str(e))
        return None


# ─────────────────────────────────────────────
# Smart Fallback Prompt
# ─────────────────────────────────────────────

def _build_fallback_prompt(ingredients: list[str], rules: dict) -> str:
    examples = _get_relevant_examples(ingredients, rules)
    ing_str = ", ".join(ingredients)
    return f"""
You are a recipe generator. Create the SIMPLEST possible dish using: [{ing_str}].

{examples}

Rules:
- Use as many ingredients as possible.
- Toast, smoothie, salad, or stir-fry are all acceptable.
- Return ONLY valid JSON:

{{
  "recipe_name": "string",
  "cuisine": "string",
  "ingredients": ["string"],
  "steps": ["Step 1 (X min | flame): instruction."],
  "time_required": "string",
  "difficulty": "easy | medium | hard",
  "tips": ["string"],
  "substitutions": {{"ingredient": "substitute"}},
  "nutrition": {{"calories": "string", "protein": "string", "carbs": "string", "fat": "string", "fiber": "string"}},
  "search_queries": ["string"]
}}
""".strip()


def _ensure_recipes_envelope(env: dict) -> dict:
    """Attach `recipes` list (length 1–3) for API/cache; keeps `recipe` as best pick."""
    if env.get("error"):
        return env
    recipes = env.get("recipes")
    if recipes and isinstance(recipes, list) and len(recipes) > 0:
        return env
    r = env.get("recipe")
    if not r:
        return env
    env["recipes"] = [
        {
            "recipe": r,
            "confidence_score": env.get("confidence_score", 0),
            "used_ingredients": env.get("used_ingredients", []),
            "ignored_ingredients": env.get("ignored_ingredients", []),
        }
    ]
    return env


def _build_multi_recipe_prompt(
    data: RecipeRequest,
    pre: PreprocessResult,
    anchor_ingredients: list[str],
    avoid_recipes: list[str],
) -> str:
    prefs = data.preferences
    ingredients = pre.valid_ingredients
    ingredients_str = ", ".join(ingredients) if ingredients else "(none)"
    anchor_str = ", ".join(anchor_ingredients) if anchor_ingredients else ingredients_str
    avoid_block = ""
    if avoid_recipes:
        avoid_block = (
            "FORBIDDEN duplicate dish names (already shown to user): "
            + ", ".join(f'"{n}"' for n in avoid_recipes[:8])
            + "\nEach of the 3 recipes MUST have a unique recipe_name not in this list.\n"
        )
    veg_block = ""
    if pre.veg_removed:
        veg_block = f"VEG MODE — never use: {', '.join(pre.veg_removed)}\n"
    cuisine_note = f"Cuisine bias: {data.cuisine or 'Indian (Gujarati-friendly)'}."
    spice_note = f"Spice: {prefs.spice_level}."
    rules_m = _load_rules()
    style_hint = _get_style_hint(data.food_style, rules_m).replace("\n", " ").strip()
    style_part = f" Regional style: {style_hint}" if style_hint else ""
    cust = _customization_notes(prefs)
    cust_part = (" " + " ".join(cust)) if cust else ""
    return f"""
You are RasoiAI. User ingredients: [{ingredients_str}]
ANCHOR INGREDIENTS (each recipe must visibly use ≥70% of these in BOTH ingredients list AND steps): [{anchor_str}]
{veg_block}{avoid_block}{cuisine_note} {spice_note}.{style_part}{cust_part}
VARIETY: Produce exactly 3 DISTINCT dishes (different recipe_name, different cooking idea).
Examples: egg+bread → Masala French Toast, Egg Sandwich, Spicy Egg Toast — not three copies of the same dish.

Each recipe MUST include ALL schema fields. Steps: include time + flame in each step line.

Return ONLY valid JSON (no markdown):
{{
  "recipes": [
    {{
      "recipe_name": "string",
      "cuisine": "string",
      "ingredients": ["string"],
      "steps": ["Step 1 (2 min | medium flame): ..."],
      "time_required": "string",
      "difficulty": "easy",
      "tips": ["string"],
      "substitutions": {{}},
      "nutrition": {{"calories": "","protein": "","carbs": "","fat": "","fiber": ""}},
      "search_queries": ["string"]
    }}
  ]
}}
""".strip()


def _parse_multi_recipe_raw(raw: str) -> list[dict]:
    raw = (raw or "").strip()
    try:
        blob = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise
        blob = json.loads(m.group(0))
    arr = blob.get("recipes")
    if not isinstance(arr, list):
        raise ValueError("missing recipes array")
    out: list[dict] = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        try:
            out.append(_parse_and_validate(json.dumps(item, ensure_ascii=False)))
        except (json.JSONDecodeError, ValueError, KeyError, TypeError):
            continue
    return out


def _evaluate_multi_candidate(
    parsed: dict,
    data: RecipeRequest,
    pre: PreprocessResult,
    anchor_ingredients: list[str],
    rules: dict,
) -> dict | None:
    is_relevant, _ = _validate_ingredient_relevance(parsed, data.ingredients)
    if not is_relevant:
        return None
    anchor_ratio = _compute_anchor_usage(parsed, anchor_ingredients)
    if anchor_ratio < 0.7 and anchor_ingredients:
        return None
    veg_compliant = True
    if data.is_veg:
        veg_compliant, violations = _validate_veg_compliance(parsed, rules)
        if not veg_compliant:
            return None
    used, ignored = _analyse_ingredient_usage(parsed, data.ingredients)
    confidence = _compute_confidence(
        parsed,
        data.ingredients,
        pre,
        is_veg=data.is_veg,
        veg_compliant=veg_compliant,
        validation_passed=is_relevant,
        anchor_usage_ratio=anchor_ratio,
    )
    return {
        "recipe": _build_recipe_response(parsed),
        "confidence_score": confidence,
        "used_ingredients": used,
        "ignored_ingredients": ignored,
    }


async def _try_generate_multi_recipes(
    data: RecipeRequest,
    pre: PreprocessResult,
    anchor_ingredients: list[str],
    recent: list[str],
    rules: dict,
) -> dict | None:
    """One Gemini call → up to 3 validated recipes; None if unusable."""
    try:
        prompt = _build_multi_recipe_prompt(data, pre, anchor_ingredients, recent)
        raw = await _call_gemini(prompt, temperature=0.62, max_output_tokens=4096)
        parsed_list = _parse_multi_recipe_raw(raw)
    except Exception as e:
        logger.warning("Multi-recipe parse/call failed: %s", e)
        return None

    seen: set[str] = set()
    items: list[dict] = []
    for parsed in parsed_list:
        name = (parsed.get("recipe_name") or "").strip().lower()
        if not name or name in seen:
            continue
        entry = _evaluate_multi_candidate(parsed, data, pre, anchor_ingredients, rules)
        if entry:
            seen.add(name)
            items.append(entry)
        if len(items) >= 3:
            break

    if len(items) < 2:
        return None

    items.sort(key=lambda x: -int(x["confidence_score"]))
    best = items[0]
    for it in items:
        nm = it["recipe"].get("recipe_name", "")
        if nm:
            _remember_recipe(data.ingredients, nm)
    return {
        "recipes": items,
        "recipe": best["recipe"],
        "confidence_score": best["confidence_score"],
        "used_ingredients": best["used_ingredients"],
        "ignored_ingredients": best["ignored_ingredients"],
    }


# ─────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────

async def generate_recipe(data: RecipeRequest, noise_removed: list[str] = None) -> dict:
    """
    Returns an enhanced envelope:
    {
        "recipe": {...},           # RecipeResponse model_dump
        "confidence_score": 0-100,
        "used_ingredients": [...],
        "ignored_ingredients": [...],
        "error": True/False,
        "message": str (on error)
    }
    """
    rules = _load_rules()
    noise_removed = noise_removed or []

    # ── Full Preprocessor Pipeline ──
    pre = preprocess(
        raw_ingredients=data.ingredients,
        rules=rules,
        is_veg=data.is_veg,
        noise_removed=noise_removed,
    )

    logger.info(
        "🍳 generate_recipe | input=%s | corrected=%s | veg_removed=%s | anchor='%s'",
        data.ingredients, pre.corrected, pre.veg_removed, pre.anchor_cluster
    )

    # Override data with preprocessed valid ingredients
    data.ingredients = pre.valid_ingredients

    if not data.ingredients:
        return {
            "error": True,
            "message": "All provided ingredients were excluded. Please add valid food ingredients.",
        }

    # Compute anchor ingredients for strict enforcement
    anchor_ingredients = _get_anchor_ingredients(pre)

    # Fetch memory for anti-repetition
    recent = _get_recent_recipes(data.ingredients)

    multi_res = None
    if not data.base_recipe:
        multi_res = await _try_generate_multi_recipes(data, pre, anchor_ingredients, recent, rules)
    if multi_res:
        logger.info("✅ Multi-recipe pack | count=%d", len(multi_res.get("recipes", [])))
        return multi_res

    last_parsed = None
    veg_compliant = True

    # ── 2 Attempts: normal → strict retry ──
    for attempt in range(2):
        is_strict = attempt == 1
        prompt = _build_prompt(
            data, pre, anchor_ingredients,
            strict_retry=is_strict,
            avoid_recipes=recent,
        )

        if is_strict:
            logger.warning(
                "⚠️ Strict retry | prev='%s' | anchor_ings=%s",
                last_parsed.get("recipe_name") if last_parsed else "N/A",
                anchor_ingredients,
            )

        try:
            raw_text = await _call_gemini(prompt, temperature=0.6)
            parsed = _parse_and_validate(raw_text)

            recipe_name = parsed.get("recipe_name", "")

            # ── Anti-repetition check ──
            if _is_repeated(data.ingredients, recipe_name):
                logger.warning(
                    "🔁 Repetition detected: '%s' already in memory. Retrying.", recipe_name
                )
                last_parsed = parsed
                if attempt < 1:
                    continue
                # If still repeated on 2nd attempt, accept it rather than falling back
                logger.warning("🔁 Could not avoid repetition after retry — accepting '%s'", recipe_name)

            # ── Ingredient relevance (50% threshold, steps+ingredients) ──
            is_relevant, ing_ratio = _validate_ingredient_relevance(parsed, data.ingredients)
            logger.info(
                "📊 Attempt %d | recipe='%s' | ing_match=%.0f%% | relevant=%s",
                attempt + 1, recipe_name, ing_ratio * 100, is_relevant
            )

            if not is_relevant:
                last_parsed = parsed
                if attempt < 1:
                    continue
                logger.error("❌ Rejected after 2 attempts | match=%.0f%%", ing_ratio * 100)
                break

            # ── Anchor cluster enforcement (70% threshold) ──
            anchor_ratio = _compute_anchor_usage(parsed, anchor_ingredients)
            anchor_ok = anchor_ratio >= 0.7 or not anchor_ingredients
            logger.info(
                "🔗 Anchor usage: %.0f%% (ok=%s) | anchor_ings=%s",
                anchor_ratio * 100, anchor_ok, anchor_ingredients
            )

            if not anchor_ok:
                last_parsed = parsed
                if attempt < 1:
                    continue
                logger.warning("⚠️ Anchor usage low (%.0f%%) — accepting anyway on final attempt", anchor_ratio * 100)

            # ── P0: Veg output compliance ──
            if data.is_veg:
                veg_compliant, violations = _validate_veg_compliance(parsed, rules)
                if not veg_compliant:
                    logger.warning(
                        "🚫 Veg compliance FAILED attempt %d | violations=%s",
                        attempt + 1, violations
                    )
                    last_parsed = parsed
                    if attempt < 1:
                        continue
                    break

            # ── All checks passed: initial scoring ──
            used, ignored = _analyse_ingredient_usage(parsed, data.ingredients)
            confidence = _compute_confidence(
                parsed, data.ingredients, pre,
                is_veg=data.is_veg,
                veg_compliant=veg_compliant,
                validation_passed=is_relevant,
                anchor_usage_ratio=anchor_ratio,
            )

            # ── Confidence-based retry (Upgrade 2) ──
            if confidence < 60:
                logger.warning(
                    "⚠️ Low confidence (%d%%) for '%s' — attempting quality improvement.",
                    confidence, recipe_name
                )
                improved = await _quality_retry(data.ingredients, parsed, pre.anchor_cluster)
                if improved:
                    imp_anchor_ratio = _compute_anchor_usage(improved, anchor_ingredients)
                    imp_confidence = _compute_confidence(
                        improved, data.ingredients, pre,
                        is_veg=data.is_veg,
                        veg_compliant=veg_compliant,
                        validation_passed=True,
                        anchor_usage_ratio=imp_anchor_ratio,
                    )
                    if imp_confidence > confidence:
                        logger.info(
                            "📈 Quality improved: '%s'→'%s' | confidence %d→%d",
                            recipe_name, improved.get("recipe_name"), confidence, imp_confidence
                        )
                        parsed = improved
                        recipe_name = improved.get("recipe_name", recipe_name)
                        used, ignored = _analyse_ingredient_usage(parsed, data.ingredients)
                        confidence = imp_confidence
                    else:
                        logger.info("📊 Quality retry did not improve (was %d, got %d) — keeping original.", confidence, imp_confidence)

            _remember_recipe(data.ingredients, recipe_name)

            logger.info(
                "✅ Accepted: '%s' | confidence=%d | used=%s | ignored=%s",
                recipe_name, confidence, used, ignored
            )

            return _ensure_recipes_envelope({
                "recipe": _build_recipe_response(parsed),
                "confidence_score": confidence,
                "used_ingredients": used,
                "ignored_ingredients": ignored,
            })

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning("⚠️ Parse error attempt %d: %s", attempt + 1, str(e))
            if attempt == 1:
                break
            continue
        except Exception as e:
            logger.warning("⚠️ Gemini/API error attempt %d: %s", attempt + 1, str(e))
            if attempt < 1:
                continue
            break

    # ── Smart Fallback: simpler Gemini call ──
    logger.warning("🔄 Smart fallback | ingredients=%s", data.ingredients)
    try:
        fallback_prompt = _build_fallback_prompt(data.ingredients, rules)
        raw_fallback = await _call_gemini(fallback_prompt, temperature=0.4)
        fallback_parsed = _parse_and_validate(raw_fallback)

        used, ignored = _analyse_ingredient_usage(fallback_parsed, data.ingredients)
        anchor_ratio = _compute_anchor_usage(fallback_parsed, anchor_ingredients)
        confidence = _compute_confidence(
            fallback_parsed, data.ingredients, pre,
            is_veg=data.is_veg,
            veg_compliant=True,
            validation_passed=False,  # fallback = validation failed upstream
            anchor_usage_ratio=anchor_ratio,
        )

        logger.info("✅ Smart fallback: '%s' | confidence=%d", fallback_parsed.get("recipe_name"), confidence)
        return _ensure_recipes_envelope({
            "recipe": _build_recipe_response(fallback_parsed),
            "confidence_score": confidence,
            "used_ingredients": used,
            "ignored_ingredients": ignored,
        })
    except Exception as e:
        logger.error("❌ Smart fallback failed: %s", str(e))
        return {
            "error": True,
            "message": "AI could not generate a valid recipe. Please try different ingredients.",
        }
