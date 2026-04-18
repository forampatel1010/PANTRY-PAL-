import json
import os
from functools import lru_cache

from fastapi import APIRouter, Query

from app.services.search_service import fetch_all_resources
from app.utils.response_formatter import DEFAULT_INGREDIENT_SUGGESTIONS, success_response, error_response

router = APIRouter(prefix="/api", tags=["Search"])


_RULES_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "recipe_rules.json")
)


@lru_cache(maxsize=1)
def _recipe_rules() -> dict:
    with open(_RULES_PATH, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _ingredient_vocab() -> tuple[str, ...]:
    """Canonical ingredient tokens from recipe_rules (categories + aliases)."""
    data = _recipe_rules()
    words: set[str] = set()
    for items in data.get("ingredient_categories", {}).values():
        for w in items:
            t = str(w).strip().lower()
            if t:
                words.add(t)
    for k, v in data.get("ingredient_aliases", {}).items():
        for raw in (k, str(v)):
            t = raw.strip().lower()
            if t:
                words.add(t)
    return tuple(sorted(words))


# Extra “goes well with” hints (UX); merged with synergy_pairs from recipe_rules.
_CONTEXT_PAIR_EXTRAS: dict[str, tuple[str, ...]] = {
    "egg": ("bread", "onion", "butter"),
    "paneer": ("capsicum", "tomato", "cream"),
    "rice": ("egg", "dal", "onion"),
    "tomato": ("onion", "garlic", "capsicum"),
    "chicken": ("onion", "tomato", "ginger"),
    "dal": ("rice", "onion", "tomato"),
    "bread": ("egg", "butter", "cheese"),
    "potato": ("onion", "tomato", "peas"),
}


def _neighbor_map_from_synergy(rules: dict) -> dict[str, list[str]]:
    neighbors: dict[str, list[str]] = {}
    for row in rules.get("synergy_pairs") or []:
        ings = [str(x).strip().lower() for x in (row.get("ingredients") or []) if str(x).strip()]
        for i in ings:
            for j in ings:
                if i != j:
                    neighbors.setdefault(i, []).append(j)
    for key, extras in _CONTEXT_PAIR_EXTRAS.items():
        k = key.strip().lower()
        for x in extras:
            t = x.strip().lower()
            if t and t != k:
                neighbors.setdefault(k, []).append(t)
    # dedupe preserving order
    out: dict[str, list[str]] = {}
    for k, vals in neighbors.items():
        seen: set[str] = set()
        uniq: list[str] = []
        for v in vals:
            if v not in seen:
                seen.add(v)
                uniq.append(v)
        out[k] = uniq
    return out


_CATEGORY_UI_ORDER: tuple[tuple[str, str], ...] = (
    ("vegetable", "Vegetables"),
    ("protein", "Proteins"),
    ("base", "Grains & staples"),
    ("dairy", "Dairy"),
    ("spice", "Spices"),
    ("flavor", "Pantry"),
    ("fruit", "Fruits"),
)


@lru_cache(maxsize=1)
def _ingredient_suggest_meta() -> dict:
    """Bundled UI data: browse categories + pairing index + popular list."""
    rules = _recipe_rules()
    vocab_set = set(_ingredient_vocab())
    raw_cats = rules.get("ingredient_categories") or {}
    categories: list[dict] = []
    for key, label in _CATEGORY_UI_ORDER:
        items = raw_cats.get(key) or []
        cleaned = [str(w).strip().lower() for w in items if str(w).strip()]
        cleaned = [w for w in cleaned if w in vocab_set]
        if cleaned:
            categories.append({"id": key, "label": label, "items": cleaned})
    pairings = _neighbor_map_from_synergy(rules)
    popular = [p for p in _POPULAR_INGREDIENTS if p in vocab_set]
    return {
        "categories": categories,
        "pairings": pairings,
        "popular": popular,
    }


_POPULAR_INGREDIENTS = (
    "onion",
    "tomato",
    "potato",
    "egg",
    "paneer",
    "rice",
    "garlic",
    "ginger",
    "capsicum",
    "spinach",
    "bread",
    "milk",
    "chicken",
    "dal",
    "butter",
    "curd",
)


def compute_ingredient_suggestions(q: str, limit: int = 14) -> list[str]:
    """Pure helper (safe to unit-test); `limit` must be a real int."""
    vocab = _ingredient_vocab()
    vset = set(vocab)
    qn = (q or "").strip().lower()
    lim = max(1, min(int(limit), 40))

    if not qn:
        out: list[str] = [p for p in _POPULAR_INGREDIENTS if p in vset]
        for w in vocab:
            if len(out) >= lim:
                break
            if w not in out:
                out.append(w)
        return out[:lim]

    starts = [w for w in vocab if w.startswith(qn)]
    seen = set(starts)
    contains = [w for w in vocab if qn in w and w not in seen]
    return (starts + contains)[:lim]


@router.get("/status")
async def get_status():
    status_data = {
        "ai": "ok",
        "search": "ok",
        "pdf": "ok"
    }
    return success_response(data=status_data, message="System is healthy")

@router.get("/search-links")
async def search_links(
    query: str = Query(..., min_length=3, description="Recipe search term"),
):
    try:
        result = await fetch_all_resources([query])
        return success_response(data=result, message="Search results fetched.")
    except Exception as e:
        return error_response(
            message="Search links aren’t available right now.",
            error=str(e),
            code="search_failed",
            hint="You can still cook — try a shorter search word or try again shortly.",
        )


@router.get("/suggest-ingredients")
async def suggest_ingredients(
    q: str = Query("", max_length=48, description="Partial ingredient name"),
    limit: int = Query(14, ge=1, le=40),
):
    """Autocomplete chips from the same vocabulary the AI preprocessor uses."""
    try:
        out = compute_ingredient_suggestions(q, limit)
        return success_response(
            data={"suggestions": out},
            message="Ingredient suggestions.",
        )
    except Exception as e:
        return error_response(
            message="Ingredient suggestions are offline for a moment.",
            error=str(e),
            code="suggest_failed",
            hint="You can still type common items like onion, tomato, or rice.",
            suggestions=list(DEFAULT_INGREDIENT_SUGGESTIONS),
        )


@router.get("/ingredient-meta")
async def ingredient_meta():
    """Categories, pairing index, and popular list for smart suggestion UI (cached)."""
    try:
        return success_response(
            data=_ingredient_suggest_meta(),
            message="Ingredient suggestion metadata.",
        )
    except Exception as e:
        return error_response(
            message="Ingredient metadata is offline for a moment.",
            error=str(e),
            code="ingredient_meta_failed",
            hint="Suggestions still work from typing — try onion, tomato, or rice.",
        )

