#!/usr/bin/env python3
"""The front-matter shapes that crashed `validate_modules.py`, kept as tests.

A page parses two ways: with PyYAML an empty key is `None` and a bare scalar is a string; with the
validator's fallback parser both are `[]`. The validator only ever crashed on the first, which is why
CI (no PyYAML on the runner) stayed green while a developer machine with PyYAML died with
`TypeError: 'NoneType' object is not iterable`.

`scripts/frontmatter_lists.list_field` is now the only way a list-valued field is read, and this file
proves it for every shape an author can write — missing, null, empty, scalar, list — and proves the
validator actually uses it rather than the bare `.get(key, [])` default that a missing key satisfies
and an empty one does not.

Run: `python3 tests/test_frontmatter_lists.py` (also wired into the CI verify step).
"""

import importlib.util
import os
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from frontmatter_lists import as_list, list_field  # noqa: E402


class FrontmatterListTests(unittest.TestCase):
    def test_missing_key_is_empty(self):
        self.assertEqual(list_field({}, "uses"), [])

    def test_yaml_null_is_empty(self):
        self.assertEqual(list_field({"uses": None}, "uses"), [])

    def test_fallback_parser_empty_list_is_empty(self):
        self.assertEqual(list_field({"uses": []}, "uses"), [])

    def test_a_bare_scalar_wraps(self):
        """`uses: jacobian` is one concept, not twelve characters to iterate over."""
        self.assertEqual(list_field({"uses": "jacobian"}, "uses"), ["jacobian"])

    def test_a_blank_scalar_is_empty(self):
        self.assertEqual(list_field({"uses": "  "}, "uses"), [])

    def test_a_list_passes_through(self):
        self.assertEqual(list_field({"uses": ["a", "b"]}, "uses"), ["a", "b"])

    def test_a_number_is_refused_rather_than_iterated(self):
        with self.assertRaises(TypeError):
            as_list(3)

    def test_the_validator_uses_the_helper(self):
        """The regression was a bare `fm.get(key, [])`; keep the validator reading through the helper."""
        with open(os.path.join(ROOT, "scripts", "validate_modules.py"), encoding="utf-8") as handle:
            source = handle.read()
        self.assertIn("list_field", source)
        self.assertNotIn('fm.get("uses", [])', source)
        self.assertNotIn('fm.get("new_concepts", [])', source)
        self.assertNotIn('e.get("introduces", [])', source)

    def test_real_page_front_matter_reads_either_way(self):
        """A real page's `uses:` reads as a list whether the YAML reader returns null, [] or a scalar."""
        path = os.path.join(ROOT, "modules", "00-foundations.T2.00g.md")
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        body = text.split("---", 2)[1]
        try:
            import yaml  # noqa: PLC0415
        except ImportError:
            self.skipTest("PyYAML is not installed here; the fallback parser path is covered above")
        front = yaml.safe_load(body)
        self.assertIsInstance(front, dict)
        for key in ("new_concepts", "uses", "prereqs"):
            if key in front:
                self.assertIsInstance(list_field(front, key), list)


if __name__ == "__main__":
    unittest.main(verbosity=2)
