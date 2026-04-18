import json
import unittest

from app.services import vision_service


class TestVisionJsonParse(unittest.TestCase):
    def test_parse_ingredients_array(self):
        raw = json.dumps({"ingredients": ["Tomato", " onion "]})
        out = vision_service._parse_ingredient_json(raw)
        self.assertEqual(out, ["Tomato", "onion"])

    def test_parse_embedded_json(self):
        raw = 'Here:\n{"ingredients": ["rice", "dal"]}'
        out = vision_service._parse_ingredient_json(raw)
        self.assertEqual(out, ["rice", "dal"])


if __name__ == "__main__":
    unittest.main()
