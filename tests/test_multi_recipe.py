import json
import unittest

from app.routes.recipe import _unwrap_result
from app.services import ai_service


class TestMultiRecipeEnvelope(unittest.TestCase):
    def test_ensure_recipes_wraps_single(self):
        env = ai_service._ensure_recipes_envelope(
            {
                "recipe": {"recipe_name": "X", "cuisine": "Y"},
                "confidence_score": 77,
                "used_ingredients": ["a"],
                "ignored_ingredients": [],
            }
        )
        self.assertEqual(len(env["recipes"]), 1)
        self.assertEqual(env["recipes"][0]["confidence_score"], 77)

    def test_parse_multi_raw(self):
        raw = json.dumps(
            {
                "recipes": [
                    {
                        "recipe_name": "A",
                        "cuisine": "Indian",
                        "ingredients": ["egg"],
                        "steps": ["Step 1 (1 min | low flame): mix."],
                        "time_required": "5 min",
                        "difficulty": "easy",
                        "tips": ["t"],
                        "substitutions": {},
                        "nutrition": {"calories": "", "protein": "", "carbs": "", "fat": "", "fiber": ""},
                        "search_queries": ["q"],
                    },
                    {
                        "recipe_name": "B",
                        "cuisine": "Indian",
                        "ingredients": ["egg", "bread"],
                        "steps": ["Step 1 (1 min | low flame): toast."],
                        "time_required": "5 min",
                        "difficulty": "easy",
                        "tips": ["t"],
                        "substitutions": {},
                        "nutrition": {"calories": "", "protein": "", "carbs": "", "fat": "", "fiber": ""},
                        "search_queries": ["q"],
                    },
                ]
            }
        )
        lst = ai_service._parse_multi_recipe_raw(raw)
        self.assertEqual(len(lst), 2)
        self.assertEqual(lst[0]["recipe_name"], "A")

    def test_unwrap_builds_recipes_from_legacy(self):
        recipe = {"recipe_name": "Solo", "cuisine": "X"}
        r, meta = _unwrap_result(
            {
                "recipe": recipe,
                "confidence_score": 50,
                "used_ingredients": ["egg"],
                "ignored_ingredients": [],
            }
        )
        self.assertEqual(r, recipe)
        self.assertEqual(len(meta["recipes"]), 1)
        self.assertEqual(meta["recipes"][0]["recipe"], recipe)


if __name__ == "__main__":
    unittest.main()
