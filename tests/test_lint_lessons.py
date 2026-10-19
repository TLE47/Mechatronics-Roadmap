#!/usr/bin/env python3
"""Guard the Tier 1 jargon ban and the maths ramp's exemption from it.

`scripts/lint_lessons.py` bans Tier 2/3 vocabulary (complex numbers, Laplace,
dB, Jacobians) in the 48 beginner lessons. The ramp lessons R.5 and R.6 teach
rotation and frequency response *numerically*, before Tier 2 names them, so the
banned words are those lessons' subject and the ban is waived inside `ramp/`.
Three failures matter:

1. **The wafer is too wide** - the waiver leaks, and a beginner lesson written
   with Tier 2 jargon passes.
2. **The waiver breaks the ramp** - a ramp lesson trips the beginner ban again,
   so R.5/R.6 cannot be written at all.
3. **The waiver is vacuous** - the ramp stops containing any banned term, so
   test 1 proves nothing and the exemption quietly hides a drift.

Run: `python3 tests/test_lint_lessons.py` (also wired into the CI verify step).
"""

import os
import re
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import lint_lessons  # noqa: E402

JARGON_MARK = "banned Tier 2/3 jargon"


def jargon_errors(errors):
    return [e for e in errors if JARGON_MARK in e]


def body_without_skip(text):
    """The part of a lesson the ban reads: everything but a resource's `What to skip:` line."""
    return re.sub(r"^.*?\*\*What to skip:\*\*.*$", "", text, flags=re.MULTILINE)


def banned_labels(path):
    """The banned Tier 1 labels this lesson's body actually uses."""
    with open(path, encoding="utf-8") as handle:
        body = body_without_skip(handle.read())
    return [
        label
        for pattern, label in lint_lessons.BANNED_TIER1_JARGON
        if re.search(pattern, body, flags=re.IGNORECASE)
    ]


class LintLessonsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ramp = lint_lessons.get_ramp_files()
        cls.beginner = lint_lessons.get_lesson_files()
        cls.glossary = lint_lessons.parse_glossary()

    def test_the_ramp_exists(self):
        self.assertGreaterEqual(len(self.ramp), 2, "expected at least R.1 and R.2 in ramp/R.*.md")

    def test_beginner_lessons_are_never_exempt(self):
        for path in self.beginner:
            self.assertFalse(
                lint_lessons.is_ramp_lesson(path),
                f"{os.path.relpath(path, ROOT)} must not count as a ramp lesson, or the jargon "
                f"waiver leaks into the beginner track; check the ramp/ prefix test",
            )

    def test_ramp_lessons_are_not_hit_by_the_jargon_ban(self):
        for path in self.ramp:
            self.assertTrue(
                lint_lessons.is_ramp_lesson(path),
                f"expected {os.path.relpath(path, ROOT)} to be recognised as a ramp lesson; "
                f"check get_ramp_files(), since R.5/R.6 cannot be written without the waiver",
            )
            found = jargon_errors(lint_lessons.lint_file(path, self.glossary))
            self.assertEqual(
                found,
                [],
                f"{os.path.relpath(path, ROOT)} is a ramp lesson, so the jargon ban must be "
                f"waived there; found {found} - check is_ramp_lesson() reaches lint_file()",
            )

    def test_the_ban_still_bites_outside_the_ramp(self):
        """Negative path: the same ramp text, one directory over, must fail the ban."""
        scratch = tempfile.mkdtemp(prefix="lesson-lint-")
        self.addCleanup(shutil.rmtree, scratch, True)
        using_banned_terms = [p for p in self.ramp if banned_labels(p)]
        self.assertTrue(
            using_banned_terms,
            "expected at least one ramp lesson to use a banned term, or this negative path "
            "tests nothing; check whether the ramp drifted away from its own subject",
        )
        for source in using_banned_terms:
            copy = os.path.join(scratch, os.path.basename(source))
            shutil.copyfile(source, copy)
            self.assertFalse(
                lint_lessons.is_ramp_lesson(copy),
                f"a copy of {os.path.basename(source)} in a scratch dir must not count as a "
                f"ramp lesson; check that is_ramp_lesson() keys on the path, not the name",
            )
            found = jargon_errors(lint_lessons.lint_file(copy, self.glossary))
            self.assertTrue(
                found,
                f"expected {os.path.basename(source)} outside ramp/ to trip the jargon ban, "
                f"but the linter found none; check that the waiver is path-scoped only",
            )

    def test_the_exemption_is_loading_bearing(self):
        """At least one banned term must still appear in a ramp lesson, or the waiver hides drift."""
        hits = [(os.path.basename(p), label) for p in self.ramp for label in banned_labels(p)]
        self.assertTrue(
            hits,
            "no ramp lesson uses a banned Tier 1 term any more - the exemption is now "
            "waiving nothing, so drop it (or re-check whether the ramp drifted)",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
