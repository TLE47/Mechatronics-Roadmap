#!/usr/bin/env python3
"""The generated next-step line is navigation, not teaching.

Every routed page ends with a machine-written `next-step` block naming its successor by full
title. `check_term_order.py` counts a page as *using* a glossary term if the word appears in its
body, so those titles made P.1 look like it taught "Order of Operations" one page before P.2 does:
47 violations, every one of them a page previewing its own next lesson. This test holds the
stripping rule that fixes it, without asserting anything about the glossary itself.

Run: `python3 tests/test_term_order.py` (also collected by `python3 -m unittest discover -s tests`).
"""

import os
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_term_order  # noqa: E402


class StripForwardNavigationTest(unittest.TestCase):
    def test_generated_next_step_block_is_removed(self):
        page = (
            "## Goal\n"
            "Store values in variables.\n\n"
            "<!-- next-step:start -->\n"
            "👉 **Next:** [Step 1 — Lesson P.2: Computer Arithmetic and Order of Operations](P.2-x.md)\n"
            "<!-- next-step:end -->\n"
        )
        cleaned = check_term_order.strip_forward_navigation(page)
        self.assertIn("Store values in variables.", cleaned, "expected the page's own line to survive the strip")
        self.assertNotIn("Order of Operations", cleaned, "expected the generated title to be stripped")
        self.assertNotIn("next-step", cleaned, "expected no next-step marker to survive the strip")

    def test_a_real_lesson_keeps_its_prose_and_loses_its_preview(self):
        path = os.path.join(ROOT, "track-p", "P.1-variables-and-data-types.md")
        with open(path, "r", encoding="utf-8") as handle:
            raw = handle.read()
        self.assertIn("<!-- next-step:start -->", raw, "expected P.1 to carry the generated block")
        cleaned = check_term_order.strip_forward_navigation(raw)
        self.assertNotIn(
            "<!-- next-step:start -->", cleaned, "expected the opening marker to be stripped"
        )
        self.assertNotIn(
            "Order of Operations",
            cleaned,
            "expected the successor's title not to count as P.1's own text",
        )
        self.assertIn("## Goal", cleaned, "expected the page's own content to survive the strip")


if __name__ == "__main__":
    unittest.main()
