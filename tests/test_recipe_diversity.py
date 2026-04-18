"""Regression tests: offline fallback and cache keys must vary with user input."""

import unittest

from app.models.recipe_model import RecipeRequest
from app.utils.cache import generate_cache_key
from app.utils.fallback import get_fallback_recipe


class TestFallbackRecipeDiversity(unittest.TestCase):
    def test_distinct_recipe_titles_for_typical_inputs(self):
        cases = [
            ["onion"],
            ["tomato", "garlic"],
            ["rice", "lentils"],
            ["spinach"],
            ["mushroom", "cream cheese"],
        ]
        titles = [get_fallback_recipe(ing)["recipe_name"] for ing in cases]
        self.assertEqual(len(titles), len(set(titles)), f"Duplicate titles: {titles}")

    def test_user_ingredients_appear_in_body(self):
        ing = ["onion", "tomato"]
        r = get_fallback_recipe(ing)
        blob = (r["recipe_name"] + " " + " ".join(r["steps"]) + " " + " ".join(r["ingredients"])).lower()
        for word in ("onion", "tomato"):
            with self.subTest(word=word):
                self.assertIn(word, blob)

    def test_egg_branch_still_distinct_from_onion(self):
        egg = get_fallback_recipe(["egg", "onion"])["recipe_name"]
        only_onion = get_fallback_recipe(["onion"])["recipe_name"]
        self.assertNotEqual(egg.lower(), only_onion.lower())

    def test_empty_input_uses_pantry_template_not_aloo(self):
        r = get_fallback_recipe([])
        self.assertNotIn("aloo", r["recipe_name"].lower())
        self.assertIn("pantry", " ".join(r["steps"]).lower() + r["recipe_name"].lower())


class TestCacheKeyStability(unittest.TestCase):
    def test_veg_flag_changes_cache_key(self):
        a = RecipeRequest(ingredients=["onion"], is_veg=False)
        b = RecipeRequest(ingredients=["onion"], is_veg=True)
        self.assertNotEqual(generate_cache_key(a), generate_cache_key(b))

    def test_same_ingredients_same_key(self):
        a = RecipeRequest(ingredients=["Tomato", "Onion"])
        b = RecipeRequest(ingredients=["onion", "tomato"])
        self.assertEqual(generate_cache_key(a), generate_cache_key(b))

    def test_deterministic_key(self):
        r = RecipeRequest(ingredients=["salt", "pepper"], cuisine="Indian")
        self.assertEqual(generate_cache_key(r), generate_cache_key(r))


if __name__ == "__main__":
    unittest.main()
