import hashlib
import json
import threading
from typing import Any, Optional

_cache: dict[str, Any] = {}
_lock = threading.Lock()


def _preferences_payload(data: Any) -> dict:
    prefs = getattr(data, "preferences", None)
    if prefs is not None and hasattr(prefs, "model_dump"):
        return prefs.model_dump()
    if isinstance(data, dict):
        return dict(data.get("preferences") or {})
    return {}


def generate_cache_key(data: Any) -> str:
    """
    Stable cache key: same logical request always maps to the same key
    (unlike builtins.hash(), which is salted per process in Python 3).
    """
    if hasattr(data, "ingredients"):
        ingredients = list(data.ingredients or [])
        cuisine = (data.cuisine or "").strip().lower()
        is_veg = bool(getattr(data, "is_veg", False))
        food_style = (getattr(data, "food_style", None) or "").strip().lower()
        mod_req = (getattr(data, "modification_request", None) or "").strip().lower()[:240]
        br = getattr(data, "base_recipe", None)
    else:
        ingredients = list(data.get("ingredients") or [])
        cuisine = (data.get("cuisine") or "").strip().lower()
        is_veg = bool(data.get("is_veg", False))
        food_style = (data.get("food_style") or "").strip().lower()
        mod_req = (data.get("modification_request") or "").strip().lower()[:240]
        br = data.get("base_recipe")

    base_fp = ""
    if isinstance(br, dict) and br:
        base_fp = hashlib.sha256(
            json.dumps(br, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()[:20]

    key_dict = {
        "ingredients": sorted(i.strip().lower() for i in ingredients if i and str(i).strip()),
        "cuisine": cuisine,
        "preferences": _preferences_payload(data),
        "is_veg": is_veg,
        "food_style": food_style,
        "modification_request": mod_req,
        "base_recipe_fp": base_fp,
    }
    canonical = json.dumps(key_dict, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def get_cache(key: str) -> Optional[Any]:
    with _lock:
        return _cache.get(key)


MAX_CACHE_SIZE = 1000


def set_cache(key: str, value: Any) -> None:
    with _lock:
        if len(_cache) >= MAX_CACHE_SIZE:
            oldest_key = next(iter(_cache))
            del _cache[oldest_key]
        _cache[key] = value


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def cache_size() -> int:
    with _lock:
        return len(_cache)


def delete_cache(key: str) -> None:
    """Delete a specific cache entry to force fresh generation."""
    with _lock:
        _cache.pop(key, None)
