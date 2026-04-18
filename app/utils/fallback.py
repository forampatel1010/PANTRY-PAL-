"""
Offline / emergency recipes when the AI path is unavailable.

Every distinct ingredient set gets a distinct recipe title and steps
that name the user's ingredients — no single default like 'Aloo Sabzi'
for unrelated inputs.
"""


def _title_case_phrase(s: str) -> str:
    t = " ".join(w.capitalize() for w in s.strip().split())
    return t or "Ingredients"


def _dynamic_recipe_from_ingredients(cleaned: list[str]) -> dict:
    """Build a complete recipe dict keyed on the user's actual ingredients."""
    sorted_unique = sorted({i.strip() for i in cleaned if i and str(i).strip()}, key=str.lower)
    display = [_title_case_phrase(x) for x in sorted_unique]
    if not display:
        display = ["Pantry Staples"]

    if len(display) == 1:
        recipe_name = f"{display[0]} — Quick Home Plate"
    elif len(display) <= 3:
        recipe_name = f"{' & '.join(display)} — Simple One-Pan Meal"
    else:
        recipe_name = f"{', '.join(display[:3])} + {len(display) - 3} more — Mixed Rasoi Bowl"

    ing_list = list(sorted_unique)
    if not sorted_unique:
        ing_list.append("Your choice of vegetables, pulses, or protein from the kitchen")
    ing_list.extend(
        [
            "1–2 tbsp neutral cooking oil (or butter)",
            "Salt to taste",
            "Black pepper or chaat masala (optional)",
            "Fresh lemon or lime wedge (optional)",
        ]
    )

    prep_sources = sorted_unique if sorted_unique else ["ingredients from your kitchen"]
    steps: list[str] = []
    n = 1
    for raw in prep_sources:
        label = _title_case_phrase(raw)
        steps.append(
            f"Step {n} (4 min | medium flame): Prep {label} — wash, peel if needed, "
            f"and chop or slice so it cooks evenly with the other items."
        )
        n += 1
    steps.append(
        f"Step {n} (10 min | medium-low flame): In a wide pan, heat oil; add ingredients in order "
        f"of hardness (firmer pieces first if sizes differ). Cook until tender and lightly golden, "
        f"stirring so nothing sticks."
    )
    n += 1
    steps.append(
        f"Step {n} (2 min | low flame): Season with salt; add a splash of water if the pan looks dry. "
        f"Cover briefly so flavours combine."
    )
    n += 1
    steps.append(
        f"Step {n} (off flame): Taste, adjust salt or lemon, and serve hot. "
        f"(This is an offline template — use RasoiAI online for a fully tailored chef version.)"
    )

    if sorted_unique:
        queries = [
            f"quick recipe {' '.join(sorted_unique[:4])}",
            f"easy home cooking {sorted_unique[0]}",
        ]
    else:
        queries = ["quick pantry recipe", "simple home dinner ideas"]

    return {
        "recipe_name": recipe_name,
        "cuisine": "Home-style (offline template)",
        "ingredients": ing_list,
        "steps": steps,
        "time_required": f"{max(15, 8 + 4 * len(sorted_unique))} minutes",
        "difficulty": "easy",
        "tips": [
            "Cut pieces to a similar size so they finish cooking together.",
            "If anything looks dry, add 1–2 tbsp water and cover for a minute.",
        ],
        "substitutions": {"oil": "ghee or any vegetable oil you have"},
        "nutrition": {
            "calories": "~varies",
            "protein": "~varies",
            "carbs": "~varies",
            "fat": "~varies",
            "fiber": "~varies",
        },
        "search_queries": queries,
    }


def get_fallback_recipe(ingredients: list | None = None) -> dict:
    if ingredients is None:
        ingredients = []

    cleaned = [str(i).strip() for i in ingredients if i and str(i).strip()]
    text_ingredients = " ".join(i.lower() for i in cleaned)

    if "egg" in text_ingredients:
        return {
            "recipe_name": "Egg Curry",
            "cuisine": "Indian",
            "ingredients": [
                "4 hard-boiled eggs, halved",
                "2 tbsp oil",
                "1 large onion, finely chopped",
                "2 tomatoes, pureed",
                "1 tsp ginger-garlic paste",
                "1 tsp garam masala",
                "1 tsp turmeric powder",
                "Salt to taste",
                "Fresh coriander for garnish",
            ],
            "steps": [
                "Step 1 (2 min | medium flame): Heat oil in a pan and sauté onions until golden brown.",
                "Step 2 (1 min | medium flame): Add ginger-garlic paste and cook until fragrant.",
                "Step 3 (3 min | medium flame): Add tomato puree, turmeric, and salt. Cook until oil separates.",
                "Step 4 (5 min | low flame): Add water to form a gravy, bring to boil, and stir in garam masala.",
                "Step 5 (2 min | low flame): Gently drop in the halved boiled eggs, cover, and simmer.",
                "Step 6 (off flame): Garnish with coriander and serve hot.",
            ],
            "time_required": "20 minutes",
            "difficulty": "medium",
            "tips": ["Prick the boiled eggs slightly before adding so they absorb the gravy."],
            "substitutions": {"oil": "butter or ghee"},
            "nutrition": {"calories": "~250 kcal", "protein": "14g", "carbs": "8g", "fat": "18g", "fiber": "2g"},
            "search_queries": ["Simple egg curry", "Dhaba style egg masala"],
        }

    if "paneer" in text_ingredients:
        return {
            "recipe_name": "Paneer Butter Masala",
            "cuisine": "Indian",
            "ingredients": [
                "200g paneer, cubed",
                "2 tbsp butter",
                "1 large onion, finely chopped",
                "3 tomatoes, pureed",
                "1/4 cup fresh cream",
                "1 tsp kasuri methi",
                "1 tsp red chilli powder",
                "Salt to taste",
            ],
            "steps": [
                "Step 1 (2 min | medium flame): Melt butter in a pan, add onions and fry until translucent.",
                "Step 2 (4 min | medium flame): Add tomato puree, salt, and chilli powder. Cook until butter separates.",
                "Step 3 (2 min | low flame): Stir in fresh cream and crushed kasuri methi.",
                "Step 4 (2 min | low flame): Add paneer cubes, mix gently to coat with gravy, and simmer.",
                "Step 5 (off flame): Serve hot with naan or rice.",
            ],
            "time_required": "25 minutes",
            "difficulty": "medium",
            "tips": ["Soak paneer in warm water for 10 mins beforehand to make it extra soft."],
            "substitutions": {"fresh cream": "cashew paste"},
            "nutrition": {"calories": "~350 kcal", "protein": "12g", "carbs": "10g", "fat": "28g", "fiber": "2g"},
            "search_queries": ["Paneer butter masala quick", "Restaurant style paneer"],
        }

    if "banana" in text_ingredients:
        return {
            "recipe_name": "Banana Sweet Dessert",
            "cuisine": "Global",
            "ingredients": [
                "2 ripe bananas, mashed",
                "1 cup milk",
                "2 tbsp sugar or honey",
                "A pinch of cardamom powder",
                "Chopped nuts for garnish",
            ],
            "steps": [
                "Step 1 (1 min): Peel and mash the ripe bananas in a bowl until smooth.",
                "Step 2 (2 min | medium flame): In a small saucepan, warm the milk over medium heat.",
                "Step 3 (2 min | low flame): Stir the mashed bananas, sugar/honey, and cardamom into the milk.",
                "Step 4 (1 min | low flame): Stir continuously until it thickens slightly.",
                "Step 5 (off flame): Pour into bowls, garnish with nuts, and serve warm or chilled.",
            ],
            "time_required": "10 minutes",
            "difficulty": "easy",
            "tips": ["Use overripe bananas for extra natural sweetness."],
            "substitutions": {"sugar": "jaggery or maple syrup", "milk": "almond milk"},
            "nutrition": {"calories": "~180 kcal", "protein": "4g", "carbs": "35g", "fat": "2g", "fiber": "3g"},
            "search_queries": ["Quick banana dessert", "Healthy banana sweet"],
        }

    # Default: always ingredient-specific (fixes 'everything → Aloo Sabzi')
    return _dynamic_recipe_from_ingredients(cleaned)
