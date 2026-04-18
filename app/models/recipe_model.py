from pydantic import BaseModel, Field, field_validator
from typing import Any, Optional


class Preferences(BaseModel):
    spice_level: Optional[str] = Field(default="medium", pattern="^(low|medium|high)$")
    budget_mode: bool = False
    health_mode: bool = False
    quick_mode: bool = False
    oil_level: str = Field(default="normal", pattern="^(low|normal)$")
    high_protein: bool = False
    low_calorie: bool = False
    more_vegetables: bool = False


_BASE_RECIPE_KEYS = frozenset({
    "recipe_name",
    "cuisine",
    "ingredients",
    "steps",
    "time_required",
    "difficulty",
    "tips",
    "substitutions",
    "nutrition",
    "search_queries",
})


class RecipeRequest(BaseModel):
    ingredients: list[str] = Field(default_factory=list, max_length=15)
    cuisine: Optional[str] = Field(default=None, max_length=50)
    preferences: Optional[Preferences] = Field(default_factory=Preferences)
    is_veg: bool = Field(default=False, description="If true, strictly avoid non-vegetarian ingredients")
    food_style: Optional[str] = Field(default=None, max_length=50, description="e.g. Gujarati, Street Food, South Indian")
    base_recipe: Optional[dict[str, Any]] = Field(
        default=None,
        description="When set, AI refines this recipe instead of inventing a new dish from scratch.",
    )
    modification_request: Optional[str] = Field(default=None, max_length=400)

    @field_validator("base_recipe")
    @classmethod
    def sanitize_base_recipe(cls, v: Optional[dict]) -> Optional[dict]:
        if not v or not isinstance(v, dict):
            return None
        out: dict[str, Any] = {}
        for k in _BASE_RECIPE_KEYS:
            if k not in v:
                continue
            val = v[k]
            if k == "ingredients" and isinstance(val, list):
                out[k] = [str(x).strip()[:120] for x in val[:35] if str(x).strip()]
            elif k == "steps" and isinstance(val, list):
                out[k] = [str(x).strip()[:500] for x in val[:25] if str(x).strip()]
            elif k == "tips" and isinstance(val, list):
                out[k] = [str(x).strip()[:200] for x in val[:12] if str(x).strip()]
            elif k == "search_queries" and isinstance(val, list):
                out[k] = [str(x).strip()[:80] for x in val[:8] if str(x).strip()]
            elif k == "substitutions" and isinstance(val, dict):
                items = list(val.items())[:20]
                out[k] = {str(a)[:60]: str(b)[:120] for a, b in items}
            elif k == "nutrition" and isinstance(val, dict):
                out[k] = {str(a)[:20]: str(b)[:40] for a, b in list(val.items())[:12]}
            elif isinstance(val, str):
                if k in ("recipe_name", "time_required", "difficulty", "cuisine"):
                    out[k] = val.strip()[:300]
                else:
                    out[k] = val.strip()[:120]
        return out or None


class Nutrition(BaseModel):
    calories: Optional[str] = None
    protein: Optional[str] = None
    carbs: Optional[str] = None
    fat: Optional[str] = None
    fiber: Optional[str] = None


class RecipeResponse(BaseModel):
    recipe_name: str = Field(..., min_length=1)
    cuisine: str = Field(..., min_length=1)
    ingredients: list[str] = Field(..., min_length=1)
    steps: list[str] = Field(..., min_length=1)
    time_required: str = Field(..., min_length=1)
    difficulty: str = Field(..., pattern="^(easy|medium|hard)$")
    tips: list[str] = Field(default_factory=list)
    substitutions: dict[str, str] = Field(default_factory=dict)
    nutrition: Nutrition = Field(default_factory=Nutrition)
    search_queries: list[str] = Field(default_factory=list)
