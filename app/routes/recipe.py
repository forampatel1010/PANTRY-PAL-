import asyncio
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Query

from app.models.recipe_model import RecipeRequest
from app.services.ai_service import generate_recipe
from app.utils.cache import get_cache, set_cache, generate_cache_key, delete_cache
from app.utils.fallback import get_fallback_recipe
from app.utils.response_formatter import (
    DEFAULT_INGREDIENT_SUGGESTIONS,
    success_response,
    error_response,
)
from app.utils.sanitizer import sanitize_ingredients

logger = logging.getLogger(__name__)

AI_TIMEOUT_SECONDS = 55  # multi-recipe + 2-attempt single + smart fallback

router = APIRouter(prefix="/api", tags=["Recipe"])


async def _run_with_timeout(data: RecipeRequest, noise_removed: list[str]) -> dict:
    return await asyncio.wait_for(
        generate_recipe(data, noise_removed=noise_removed),
        timeout=AI_TIMEOUT_SECONDS,
    )


def _build_cache_key(data: RecipeRequest) -> str:
    return generate_cache_key(data)


def _unwrap_result(result: dict) -> tuple[dict | None, dict]:
    """
    Unwrap the enhanced envelope from generate_recipe.
    Returns (recipe_dict, meta_dict) with meta['recipes'] = list of option dicts.
    """
    recipe = result.get("recipe")
    recipes = result.get("recipes")
    if not recipes and recipe is not None:
        recipes = [
            {
                "recipe": recipe,
                "confidence_score": result.get("confidence_score", 0),
                "used_ingredients": result.get("used_ingredients", []),
                "ignored_ingredients": result.get("ignored_ingredients", []),
            }
        ]
    elif not recipes:
        recipes = []
    meta = {
        "confidence_score": result.get("confidence_score", 0),
        "used_ingredients": result.get("used_ingredients", []),
        "ignored_ingredients": result.get("ignored_ingredients", []),
        "recipes": recipes,
    }
    return recipe, meta


@router.post("/generate-recipe")
async def generate_recipe_route(
    data: RecipeRequest,
    refresh: bool = Query(
        default=False,
        description="Set true to bypass cache and force fresh AI generation"
    ),
):
    req_id = str(uuid.uuid4())
    start_time = time.time()

    logger.info(
        "POST /api/generate-recipe | req=%s | ingredients=%s | cuisine=%s "
        "| is_veg=%s | food_style=%s | refresh=%s",
        req_id, data.ingredients, data.cuisine, data.is_veg, data.food_style, refresh
    )

    # ── Sanitize ──
    valid_ingredients, noise_removed = sanitize_ingredients(data.ingredients)
    data.ingredients = valid_ingredients

    if not data.ingredients:
        logger.warning("Sanitization removed all ingredients | req=%s", req_id)
        if noise_removed:
            return error_response(
                message="Those entries aren’t recognised as food ingredients.",
                request_id=req_id,
                code="sanitized_empty",
                hint=(
                    "We only keep items that look like real foods — things like plastic, soap, or random text "
                    "get filtered out. Try everyday ingredients you’d actually cook with."
                ),
                suggestions=list(DEFAULT_INGREDIENT_SUGGESTIONS),
                error=f"removed:{','.join(noise_removed[:12])}",
            )
        return error_response(
            message="We couldn’t find any food ingredients in your list.",
            request_id=req_id,
            code="no_ingredients",
            hint="Add a few things you have in the kitchen — vegetables, pulses, eggs, dairy, or staples like rice or bread.",
            suggestions=list(DEFAULT_INGREDIENT_SUGGESTIONS),
        )

    # ── Cache logic ──
    cache_key = _build_cache_key(data)

    if refresh:
        delete_cache(cache_key)
        logger.info("🔄 Cache bypassed (refresh=True) | key=%s | req=%s", cache_key[:12], req_id)
    else:
        cached = get_cache(cache_key)
        if cached:
            exec_time = round(time.time() - start_time, 3)
            logger.info("📦 Cache hit | key=%s | req=%s | time=%ss", cache_key[:12], req_id, exec_time)
            return success_response(
                data={**cached, "cached": True},
                message="Recipe loaded from cache.",
                request_id=req_id,
            )

    # ── AI Generation ──
    try:
        result = await _run_with_timeout(data, noise_removed=noise_removed)
        exec_time = round(time.time() - start_time, 3)

        # Hard error from AI pipeline
        if isinstance(result, dict) and result.get("error"):
            logger.warning("AI error: %s | req=%s", result.get("message"), req_id)
            fallback = get_fallback_recipe(data.ingredients)
            fb_item = {
                "recipe": fallback,
                "confidence_score": 10,
                "used_ingredients": [],
                "ignored_ingredients": data.ingredients,
            }
            return success_response(
                data={
                    "recipe": fallback,
                    "recipes": [fb_item],
                    "fallback": True,
                    "confidence_score": 10,
                    "noise_removed": noise_removed,
                    "used_ingredients": [],
                    "ignored_ingredients": data.ingredients,
                },
                message=f"AI issue: {result['message']} — showing fallback recipe.",
                request_id=req_id,
            )

        # Unwrap enhanced envelope
        recipe, meta = _unwrap_result(result)

        # Build cacheable payload
        cached_payload = {
            "recipe": recipe,
            "recipes": meta["recipes"],
            "confidence_score": meta["confidence_score"],
            "used_ingredients": meta["used_ingredients"],
            "ignored_ingredients": meta["ignored_ingredients"],
        }
        set_cache(cache_key, cached_payload)

        logger.info(
            "✅ Generated | options=%d | best='%s' | confidence=%d | time=%ss | req=%s",
            len(meta.get("recipes") or []),
            recipe.get("recipe_name") if recipe else "",
            meta["confidence_score"],
            exec_time,
            req_id,
        )

        return success_response(
            data={
                **cached_payload,
                "cached": False,
                "noise_removed": noise_removed if noise_removed else None,
                "veg_mode": data.is_veg if data.is_veg else None,
            },
            message="Recipe generated successfully.",
            request_id=req_id,
        )

    except asyncio.TimeoutError:
        exec_time = round(time.time() - start_time, 3)
        logger.error("⏰ Timeout after %ss | req=%s", AI_TIMEOUT_SECONDS, req_id)
        fallback = get_fallback_recipe(data.ingredients)
        fb_item = {
            "recipe": fallback,
            "confidence_score": 5,
            "used_ingredients": [],
            "ignored_ingredients": data.ingredients,
        }
        return success_response(
            data={
                "recipe": fallback,
                "recipes": [fb_item],
                "fallback": True,
                "confidence_score": 5,
                "noise_removed": noise_removed,
                "used_ingredients": [],
                "ignored_ingredients": data.ingredients,
            },
            message="AI took too long — showing fallback recipe.",
            request_id=req_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error | req=%s | err=%s", req_id, str(e))
        fallback = get_fallback_recipe(data.ingredients)
        fb_item = {
            "recipe": fallback,
            "confidence_score": 5,
            "used_ingredients": [],
            "ignored_ingredients": data.ingredients,
        }
        return success_response(
            data={
                "recipe": fallback,
                "recipes": [fb_item],
                "fallback": True,
                "confidence_score": 5,
                "used_ingredients": [],
                "ignored_ingredients": data.ingredients,
            },
            message="Unexpected error — showing fallback recipe.",
            request_id=req_id,
        )


@router.post("/regenerate")
async def regenerate_recipe(
    data: RecipeRequest,
    remove_ingredient: str = "",
):
    req_id = str(uuid.uuid4())
    start_time = time.time()
    logger.info(
        "POST /api/regenerate | req=%s | remove='%s' | ingredients=%s",
        req_id, remove_ingredient, data.ingredients
    )

    if remove_ingredient:
        data.ingredients = [
            i for i in data.ingredients
            if i.strip().lower() != remove_ingredient.strip().lower()
        ]

    valid_ingredients, noise_removed = sanitize_ingredients(data.ingredients)
    data.ingredients = valid_ingredients

    if not data.ingredients:
        return error_response(
            message="There’s nothing left to cook with after removing that ingredient.",
            request_id=req_id,
            code="regenerate_empty",
            hint="Go back and add at least one food ingredient, or pick a different item to remove.",
            suggestions=list(DEFAULT_INGREDIENT_SUGGESTIONS),
        )

    # Regeneration always bypasses cache
    cache_key = _build_cache_key(data)
    delete_cache(cache_key)

    try:
        result = await _run_with_timeout(data, noise_removed=noise_removed)
        exec_time = round(time.time() - start_time, 3)

        if isinstance(result, dict) and result.get("error"):
            logger.warning("AI error on regenerate: %s | req=%s", result.get("message"), req_id)
            fallback = get_fallback_recipe(data.ingredients)
            fb_item = {
                "recipe": fallback,
                "confidence_score": 10,
                "used_ingredients": [],
                "ignored_ingredients": data.ingredients,
            }
            return success_response(
                data={
                    "recipe": fallback,
                    "recipes": [fb_item],
                    "fallback": True,
                    "confidence_score": 10,
                    "used_ingredients": [],
                    "ignored_ingredients": data.ingredients,
                },
                message=f"AI issue: {result['message']} — showing fallback recipe.",
                request_id=req_id,
            )

        recipe, meta = _unwrap_result(result)
        cached_payload = {
            "recipe": recipe,
            "recipes": meta["recipes"],
            "confidence_score": meta["confidence_score"],
            "used_ingredients": meta["used_ingredients"],
            "ignored_ingredients": meta["ignored_ingredients"],
        }
        set_cache(cache_key, cached_payload)

        logger.info(
            "✅ Regenerated | options=%d | best='%s' | confidence=%d | time=%ss | req=%s",
            len(meta.get("recipes") or []),
            recipe.get("recipe_name") if recipe else "",
            meta["confidence_score"],
            exec_time,
            req_id,
        )

        return success_response(
            data={**cached_payload, "cached": False},
            message="Recipe regenerated successfully.",
            request_id=req_id,
        )

    except asyncio.TimeoutError:
        exec_time = round(time.time() - start_time, 3)
        logger.error("⏰ Regenerate timeout after %ss | req=%s", AI_TIMEOUT_SECONDS, req_id)
        fallback = get_fallback_recipe(data.ingredients)
        fb_item = {
            "recipe": fallback,
            "confidence_score": 5,
            "used_ingredients": [],
            "ignored_ingredients": data.ingredients,
        }
        return success_response(
            data={
                "recipe": fallback,
                "recipes": [fb_item],
                "fallback": True,
                "confidence_score": 5,
                "used_ingredients": [],
                "ignored_ingredients": data.ingredients,
            },
            message="AI took too long — showing fallback recipe.",
            request_id=req_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in regenerate | req=%s | err=%s", req_id, str(e))
        fallback = get_fallback_recipe(data.ingredients)
        fb_item = {
            "recipe": fallback,
            "confidence_score": 5,
            "used_ingredients": [],
            "ignored_ingredients": data.ingredients,
        }
        return success_response(
            data={
                "recipe": fallback,
                "recipes": [fb_item],
                "fallback": True,
                "confidence_score": 5,
                "used_ingredients": [],
                "ignored_ingredients": data.ingredients,
            },
            message="Unexpected error — showing fallback recipe.",
            request_id=req_id,
        )
