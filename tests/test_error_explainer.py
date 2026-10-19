#!/usr/bin/env python3
"""Guard `docs/ERROR_EXPLAINER.md`: the page a stuck learner opens first.

The failures that matter for an index of errors:

1. **Thin entries** - a heading with no plain sentence, no "check first" bullets, or no source page, so
   the reader gets a label and nothing to do.
2. **Dead pointers** - an entry citing a page that does not exist, which is the same defect the roadmap
   has already fixed once in the coverage table.
3. **Drift out of reach** - the README losing its link to the page, so nobody finds it from the front.

Run: `python3 tests/test_error_explainer.py` (also wired into the CI verify step).
"""

import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "docs", "ERROR_EXPLAINER.md")

MIN_ENTRIES = 15
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)\s]+)\)")


def entries(text):
    """`## 1. ...` blocks, in order, with their bodies."""
    matches = list(re.finditer(r"^## (\d+)\. (.+)$", text, flags=re.MULTILINE))
    out = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        out.append((match.group(1), match.group(2).strip(), text[match.end():end]))
    return out


class ErrorExplainerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(DOC, encoding="utf-8") as handle:
            cls.text = handle.read()
        cls.entries = entries(cls.text)

    def test_there_are_at_least_fifteen_entries(self):
        self.assertGreaterEqual(
            len(self.entries), MIN_ENTRIES,
            f"expected at least {MIN_ENTRIES} `## N. Title` entries, found {len(self.entries)} - "
            f"check the heading level, since `###` entries are invisible to the index",
        )

    def test_entries_are_numbered_once_and_in_order(self):
        numbers = [int(number) for number, _title, _body in self.entries]
        self.assertEqual(
            numbers, list(range(1, len(numbers) + 1)),
            f"expected entries numbered 1..{len(numbers)} with no gap or repeat, got {numbers} - "
            f"check for a deleted entry whose number was not closed up",
        )

    def test_every_entry_says_what_it_means_and_what_to_check(self):
        for number, title, body in self.entries:
            self.assertIn(
                "**What it means.**", body,
                f"expected entry {number} ({title}) to open with a plain sentence; a reader who "
                f"reaches it has a label and nothing to do - check the bold label spelling",
            )
            self.assertIn(
                "**Check first.**", body,
                f"expected entry {number} ({title}) to carry a Check first list; without it the "
                f"entry names the error but not the next action - check the label spelling",
            )
            self.assertIn(
                "**Where it comes from.**", body,
                f"expected entry {number} ({title}) to name the page it comes from; a stuck "
                f"learner needs the source, not just the label - check the bold label spelling",
            )
            checks = re.findall(r"^- ", body.split("**Check first.**", 1)[1], flags=re.MULTILINE)
            self.assertGreaterEqual(
                len(checks), 2, f"entry {number} ({title}) has {len(checks)} check-first bullets"
            )

    def test_every_source_pointer_resolves(self):
        for number, title, body in self.entries:
            where = body.split("**Where it comes from.**", 1)[1]
            links = LINK_RE.findall(where.split("\n## ", 1)[0])
            self.assertTrue(
                links,
                f"expected entry {number} ({title}) to cite at least one page as a markdown "
                f"link under Where it comes from; check for a bare path, which LINK_RE misses",
            )
            for target in links:
                if target.startswith(("http://", "https://", "#")):
                    continue
                path = os.path.normpath(os.path.join(ROOT, "docs", target.split("#")[0]))
                self.assertTrue(
                    os.path.exists(path),
                    f"entry {number} ({title}) points at {target}, and {path} does not exist - "
                    f"check the link target and the docs/ prefix; a dead pointer is worse than none",
                )

    def test_the_front_page_links_to_it(self):
        with open(os.path.join(ROOT, "README.md"), encoding="utf-8") as handle:
            readme = handle.read()
        self.assertIn(
            "docs/ERROR_EXPLAINER.md", readme,
            "expected README.md to link docs/ERROR_EXPLAINER.md, or nobody reaches the page "
            "from the front door; check the link was not renamed with the file",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
