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
import json
import os
import shutil
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


def run_main(argv):
    """`main`, with its report captured: the assertions are about the exit code and the words."""
    with tempfile.TemporaryFile("w+", encoding="utf-8") as out:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, out
        try:
            code = fr.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr
        out.seek(0)
        return code, out.read()


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

    # ---- The command line: --out, --check, and the two ways a run can fail ----

    def test_out_writes_the_aggregate_without_touching_the_published_page(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        log = os.path.join(folder, "log.json")
        with open(log, "w", encoding="utf-8") as handle:
            json.dump(
                {"schema": "mechalab.learning-log/1", "events": [opened("A"), run("A", outcome="passed"), verified("A")]},
                handle,
            )
        with open(DOC, encoding="utf-8") as handle:
            published = handle.read()
        target = os.path.join(folder, "aggregate.md")
        code, text = run_main(["--out", target, log])
        self.assertEqual(code, 0, "expected exit 0; check that --out writes where it was told")
        self.assertIn("aggregate.md", text, "expected the message to name the file it wrote, not the published page")
        with open(target, encoding="utf-8") as handle:
            written = handle.read()
        self.assertIn(
            "## Measures", written, "expected the aggregate to be the full report, not a partial file"
        )
        with open(DOC, encoding="utf-8") as handle:
            self.assertEqual(
                handle.read(),
                published,
                "expected docs/friction-report.md to be untouched: --out exists so a trial run cannot publish",
            )

    def test_check_honours_out_and_still_reports_the_published_page_current(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        target = os.path.join(folder, "aggregate.md")
        code, text = run_main(["--out", target])
        self.assertEqual(code, 0, "expected the empty-log render to be written to the --out path")
        code, checked = run_main(["--check", "--out", target])
        self.assertEqual(code, 0, "expected --check --out to accept the file it just wrote")
        self.assertIn("is current", checked, "expected the check to say the trial report is current")
        with open(target, "a", encoding="utf-8") as handle:
            handle.write("\nstale")
        code, stale = run_main(["--check", "--out", target])
        self.assertEqual(code, 1, "expected exit 1 once the file no longer matches the logs given")
        self.assertIn("is stale", stale, "expected the check to name the file as stale, not as missing")
        code, published = run_main(["--check"])
        self.assertEqual(code, 0, "expected the published page to still pass its own check")
        self.assertIn(
            "docs/friction-report.md is current",
            published,
            "expected the default check to name the published page it compared, not the --out file",
        )

    def test_an_out_path_that_cannot_be_written_is_a_usage_error(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        code, text = run_main(["--out", os.path.join(folder, "missing", "aggregate.md")])
        self.assertEqual(code, 2, "expected exit 2 for an output path whose directory is not there")
        self.assertIn("cannot write", text, "expected the message to say the write failed, not that it succeeded")

    def test_an_unreadable_log_is_a_finding_not_a_traceback(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        log = os.path.join(folder, "log.json")
        with open(log, "w", encoding="utf-8") as handle:
            handle.write('{"schema": "someone-else/1", "events": []}')
        code, text = run_main([log])
        self.assertEqual(code, 1, "expected exit 1 for a log this script cannot read")
        self.assertIn(
            "someone-else/1",
            text,
            "expected the refusal to quote the schema it found, so the operator knows which file is wrong",
        )

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
