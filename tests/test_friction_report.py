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
            "expected the committed docs/friction-report.md to equal the empty-log render; "
            "check the template in friction_report.py, which changed without the page being "
            "regenerated - run python3 scripts/friction_report.py",
        )

    def test_attempts_are_the_runs_before_the_first_verify(self):
        events = []
        for lesson, attempts in (("A", 2), ("B", 3), ("C", 4), ("D", 9), ("E", 2)):
            events.append(opened(lesson))
            events += [run(lesson, fail="AssertionError: boom") for _ in range(attempts - 1)]
            events += [run(lesson, outcome="passed"), verified(lesson)]
        summary = fr.summarize(events)
        self.assertEqual(
            summary["attempts_p50"], 3,
            f"expected attempts p50 to be 3 from the five lessons' 2/3/4/9/2 runs; got "
            f"{summary['attempts_p50']} - check the percentile index, which must round up",
        )
        self.assertEqual(
            summary["attempts_p80"], 4,
            f"expected attempts p80 to be 4 from 2/3/4/9/2; got {summary['attempts_p80']} - "
            f"check the interpolation, since a wrong p80 hides the long tail it exists to show",
        )
        self.assertEqual(
            summary["verified"], 5,
            f"expected all five lessons to count as verified, got {summary['verified']} - "
            f"check that a verify event closes the lesson only once",
        )

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
        self.assertEqual(
            summary["opened"], 5,
            f"expected five distinct lessons opened, got {summary['opened']} - check that "
            f"summarize() counts lessons rather than lesson_open events",
        )
        self.assertEqual(
            summary["verified"], 0,
            f"expected zero verified lessons, since no verify event was emitted; got "
            f"{summary['verified']} - check a run's passed outcome is not mistaken for a verify",
        )
        self.assertAlmostEqual(
            summary["help_share"], 2 / 5,
            msg=f"expected help_share 0.4 (a hint on A, a solution on B, of five opened); got "
                f"{summary['help_share']:.6f} - check both help kinds are counted",
        )
        self.assertAlmostEqual(
            summary["unfinished_share"], 1.0,
            msg=f"expected unfinished_share 1.0, since no lesson verified; got "
                f"{summary['unfinished_share']:.6f} - check the denominator is the opened count",
        )
        self.assertAlmostEqual(
            summary["top_fail_share"], 3 / 4,
            msg=f"expected the first-failure share to be 0.75 (three of four distinct failure "
                f"lines); got {summary['top_fail_share']:.6f} - check the normalisation",
        )
        self.assertEqual(
            summary["top_fail_count"], 3,
            f"expected three lessons to fail first on the same line, got "
            f"{summary['top_fail_count']} - check the failure text is keyed without the lesson",
        )

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
        for name, threshold in (("Attempts", "attempts p80 above 6"), ("Help", "help share above 0.3"),
                                ("Unfinished", "unfinished share above 0.5"),
                                ("First failure", "one line over half the failures")):
            self.assertIn(
                name, flagged,
                f"expected a {name} red flag for a log built to cross the limit ({threshold}); "
                f"got {flagged!r} - check that threshold and the flag label",
            )

    def test_a_healthy_log_has_no_flags(self):
        events = []
        for lesson in ("A", "B", "C", "D", "E"):
            events.append(opened(lesson))
            events.append(run(lesson, outcome="passed"))
            events.append(verified(lesson))
        summary = fr.summarize(events)
        self.assertEqual(
            fr.flags(summary), [],
            f"expected no red flags for five one-run, hint-free, verified lessons; got "
            f"{fr.flags(summary)} - check a threshold is not tripped by a healthy log",
        )
        self.assertAlmostEqual(
            summary["unfinished_share"], 0.0,
            msg=f"expected unfinished_share 0.0 when every lesson verified; got "
                f"{summary['unfinished_share']:.6f} - check the verified set is applied",
        )
        self.assertAlmostEqual(
            summary["help_share"], 0.0,
            msg=f"expected help_share 0.0 with no hint or solution events; got "
                f"{summary['help_share']:.6f} - check the event-kind match",
        )
        self.assertEqual(
            summary["attempts_p80"], 1,
            f"expected attempts p80 1 when every lesson passed first try; got "
            f"{summary['attempts_p80']} - check the minimum attempt count is one, not zero",
        )

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
        self.assertAlmostEqual(
            fr.summarize(events)["active_minutes"], 3.0,
            msg=f"expected 3.0 active minutes (2 before the run, 1 after, with the 118-minute idle "
                f"gap dropped); got {fr.summarize(events)['active_minutes']:.6f} - check the "
                f"idle-gap clamp",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
