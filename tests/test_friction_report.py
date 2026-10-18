#!/usr/bin/env python3
"""Tests for `scripts/friction_report.py` and the published `docs/friction-report.md`.

The report is only useful if it is arithmetic. The failures that matter:

1. **A wrong number** - attempts-to-verify, help share, unfinished share or the first-failure share
   computed differently from the definition the page states.
2. **A silent threshold** - a measure over its limit that does not become a red flag, so a revision
   is planned around an unflagged unit.
3. **A stale page** - the committed empty page drifting from what the script renders now.
4. **An unreadable log** - a schema the script does not declare being accepted, so foreign JSON is
   averaged into a beginner's numbers.

Run: `python3 tests/test_friction_report.py` (also wired into the CI verify step).
"""

import importlib.util
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "friction_report.py")
DOC = os.path.join(ROOT, "docs", "friction-report.md")

spec = importlib.util.spec_from_file_location("friction_report", SCRIPT)
fr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fr)

MINUTE = 60_000


def run(lesson, outcome="behavior_failed", t=0, fail=None):
    event = {"t": t, "kind": "run", "lesson": lesson, "outcome": outcome}
    if fail:
        event["fail"] = fail
    return event


def opened(lesson, t=0):
    return {"t": t, "kind": "lesson_open", "lesson": lesson}


def verified(lesson, t=0):
    return {"t": t, "kind": "verified", "lesson": lesson}


class FrictionReportTests(unittest.TestCase):
    def test_the_published_page_matches_the_empty_render(self):
        with open(DOC, encoding="utf-8") as handle:
            published = handle.read()
        self.assertEqual(
            fr.render(fr.summarize([]), ["no logs"]),
            published,
            "docs/friction-report.md is stale; run python3 scripts/friction_report.py",
        )

    def test_attempts_are_the_runs_before_the_first_verify(self):
        events = []
        for lesson, attempts in (("A", 2), ("B", 3), ("C", 4), ("D", 9), ("E", 2)):
            events.append(opened(lesson))
            events += [run(lesson, fail="AssertionError: boom") for _ in range(attempts - 1)]
            events += [run(lesson, outcome="passed"), verified(lesson)]
        summary = fr.summarize(events)
        self.assertEqual(summary["attempts_p50"], 3)
        self.assertEqual(summary["attempts_p80"], 4)
        self.assertEqual(summary["verified"], 5)

    def test_help_unfinished_and_first_failure_are_shares_with_counts(self):
        events = [
            opened("A"),
            {"t": 1, "kind": "hint", "lesson": "A", "level": 3},
            opened("B"),
            {"t": 2, "kind": "solution_open", "lesson": "B"},
            opened("C"),
            opened("D"),
            run("D", fail="AssertionError: q0 missing"),
            run("C", fail="AssertionError: q0 missing"),
            run("B", fail="TypeError: list + int"),
            opened("E"),
            run("E", fail="AssertionError: q0 missing"),
        ]
        summary = fr.summarize(events)
        self.assertEqual(summary["opened"], 5)
        self.assertEqual(summary["verified"], 0)
        self.assertAlmostEqual(summary["help_share"], 2 / 5)
        self.assertAlmostEqual(summary["unfinished_share"], 1.0)
        self.assertAlmostEqual(summary["top_fail_share"], 3 / 4)
        self.assertEqual(summary["top_fail_count"], 3)

    def test_every_limit_becomes_a_red_flag(self):
        events = []
        # Three units that took nine runs and a hint: the attempts and help limits.
        for lesson in ("A", "B", "C"):
            events.append(opened(lesson))
            events += [run(lesson, fail="AssertionError: hard") for _ in range(8)]
            events.append(run(lesson, outcome="passed"))
            events.append(verified(lesson))
            events.append({"t": 9, "kind": "hint", "lesson": lesson, "level": 3})
        # Five units opened and left, all failing first on the same line: unfinished and first failure.
        for lesson in ("D", "E", "F", "G", "H"):
            events.append(opened(lesson))
            events.append(run(lesson, fail="AssertionError: same line"))
        summary = fr.summarize(events)
        flagged = "\n".join(fr.flags(summary))
        self.assertIn("Attempts", flagged)
        self.assertIn("Help", flagged)
        self.assertIn("Unfinished", flagged)
        self.assertIn("First failure", flagged)

    def test_a_healthy_log_has_no_flags(self):
        events = []
        for lesson in ("A", "B", "C", "D", "E"):
            events.append(opened(lesson))
            events.append(run(lesson, outcome="passed"))
            events.append(verified(lesson))
        summary = fr.summarize(events)
        self.assertEqual(fr.flags(summary), [])
        self.assertAlmostEqual(summary["unfinished_share"], 0.0)
        self.assertAlmostEqual(summary["help_share"], 0.0)
        self.assertEqual(summary["attempts_p80"], 1)

    def test_a_foreign_schema_is_refused(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            handle.write('{"schema": "someone-else/1", "events": []}')
            path = handle.name
        self.addCleanup(os.unlink, path)
        with self.assertRaises(ValueError):
            fr.load_events([path])

    def test_idle_gaps_do_not_count_as_active_time(self):
        events = [
            {"t": 0, "kind": "lesson_open", "lesson": "A"},
            {"t": 2 * MINUTE, "kind": "run", "lesson": "A", "outcome": "passed"},
            {"t": 120 * MINUTE, "kind": "verified", "lesson": "A"},
            {"t": 121 * MINUTE, "kind": "lesson_open", "lesson": "B"},
        ]
        self.assertAlmostEqual(fr.summarize(events)["active_minutes"], 3.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
