#!/usr/bin/env python3
"""Tests for `scripts/lint_assertions.py` and `docs/assertion-baseline.json`.

Two things can go wrong with a ratchet, and both are silent:

1. **The bar stops biting** - a message without a cause, or short, passes, and the lint becomes
   decoration. Each clause of the bar is tested on its own, including the exempt `assertRaises`.
2. **The ratchet loosens** - the baseline is raised to match the tree instead of the tree being
   fixed, or a new file starts with debt because nobody added it to the baseline.

Run: `python3 tests/test_lint_assertions.py` (also wired into the CI verify step).
"""

import importlib.util
import io
import contextlib
import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "lint_assertions", os.path.join(ROOT, "scripts", "lint_assertions.py")
)
la = importlib.util.module_from_spec(spec)
spec.loader.exec_module(la)

GOOD = "expected 3.5 A from (12.0 - 5.0)/2.0; received V/R instead - check the back-EMF term"


class AssertionLintTests(unittest.TestCase):
    def findings(self, source):
        return la.problems_in(source, "sample.py")

    def test_a_good_message_passes(self):
        source = f"self.assertAlmostEqual(actual, 3.5, delta=1e-12, msg={GOOD!r})\n"
        self.assertEqual(
            self.findings(source), [],
            f"expected the bar's own example message to pass every clause; got "
            f"{self.findings(source)} - check the length, keyword and msg= branches against "
            f"{GOOD!r}",
        )

    def test_a_positional_message_passes(self):
        source = f"self.assertEqual(actual, 3.5, {GOOD!r})\n"
        self.assertEqual(
            self.findings(source), [],
            f"expected a positional third argument to count as the message for assertEqual; got "
            f"{self.findings(source)} - check MESSAGE_POSITION, where a wrong count rejects the "
            f"form most suites use",
        )

    def test_a_fstring_message_passes(self):
        """An f-string is what most messages in tests/ are; rejecting it made the lint blind there."""
        source = (f"self.assertEqual(actual, 3.5, "
                  f"f'expected {{rate}} A from 12.0/2.0; check the back-EMF term')\n")
        self.assertEqual(
            self.findings(source), [],
            f"expected an f-string message to be read as text; got {self.findings(source)} - "
            f"check literal_text's JoinedStr branch, since a hole is not a missing message",
        )

    def test_a_missing_message_is_flagged(self):
        self.assertTrue(
            self.findings("self.assertAlmostEqual(actual, 3.5, delta=1e-12)\n"),
            "expected a bare assertAlmostEqual to be flagged; a pass here means the lint's "
            "default is 'no message needed' and the whole ratchet is decoration",
        )

    def test_a_short_message_is_flagged(self):
        self.assertTrue(
            self.findings("self.assertEqual(actual, 3.5, 'wrong')\n"),
            "expected a one-word message to be flagged; check MESSAGE_MIN_CHARS, since a short "
            "message names no formula and cannot mentor anyone",
        )

    def test_a_message_without_a_cause_is_flagged(self):
        self.assertTrue(
            self.findings("self.assertEqual(actual, 3.5, 'the current came out as something else entirely, sorry')\n"),
            "expected a message with no check/likely/expected to be flagged, however long; a "
            "pass here would accept an apology in place of a diagnosis",
        )

    def test_a_non_literal_message_is_flagged(self):
        self.assertTrue(
            self.findings("self.assertEqual(actual, 3.5, message_variable)\n"),
            "expected a bare variable as the message to be flagged; nothing can be read from it "
            "at lint time, so its length and keyword are unknown",
        )

    def test_assert_raises_is_exempt(self):
        self.assertEqual(
            self.findings("with self.assertRaises(ValueError):\n    submission.back_emf(0.0, 1.0)\n"), [],
            "expected assertRaises to be exempt: its message is the exception, and the test "
            "name already says what is refused",
        )

    def test_the_tree_holds_the_ratchet(self):
        problems = la.baseline_findings(la.scan(), la.load_baseline())
        self.assertEqual(
            problems, [],
            f"expected the tree to sit at or below docs/assertion-baseline.json; these files "
            f"are above it or unrecorded: {problems} - check a bare assertion was added, or that "
            f"a burn-down forgot to lower the baseline with --write-baseline",
        )

    def test_the_ratchet_catches_a_regression(self):
        results = {"a.py": ["x", "y"], "b.py": ["z"]}
        baseline = {"total": 2, "files": {"a.py": 1, "b.py": 1}}
        problems = la.baseline_findings(results, baseline)
        self.assertTrue(
            any("a.py: 2" in p for p in problems),
            f"expected a.py's 2 findings against a baseline of 1 to be reported; got {problems} "
            f"- check the per-file comparison, which is the clause that stops a new bare "
            f"assertion entering a recorded file",
        )
        self.assertTrue(
            any("total" in p for p in problems),
            f"expected the total mismatch to be reported as well; got {problems} - without it a "
            f"burn-down that lowers one file while raising another goes unnoticed",
        )

    def test_the_ratchet_catches_a_new_file(self):
        problems = la.baseline_findings({"new.py": ["x"]}, {"total": 0, "files": {}})
        self.assertTrue(
            any("new.py" in p for p in problems),
            f"expected an unrecorded file with findings to be reported; got {problems} - a new "
            f"test file must not be able to start with debt",
        )

    def test_the_ratchet_refuses_a_raised_baseline(self):
        problems = la.baseline_findings({}, {"total": 5, "files": {"gone.py": 5}})
        self.assertTrue(
            any("gone.py" in p for p in problems),
            f"expected a baseline above the tree to be reported; got {problems} - a floor that "
            f"can be raised to match the tree is not a ratchet",
        )


class PlanTests(unittest.TestCase):
    """`--plan` names the next package to take, so a round does not need a one-off script."""

    RESULTS = {
        "exercises/01-electronics.T1.01a/test_behavior.py": ["a"] * 7,
        "exercises/01-electronics.T1.01a/test_transfer.py": ["b"] * 3,
        "exercises/05-control.T2.05a/test_behavior.py": ["c"] * 5,
        "exercises/04-embedded.T1.04a/test_behavior.py": [],
    }

    def test_package_of_names_the_package_directory(self):
        self.assertEqual(
            la.package_of("exercises/01-electronics.T1.01a/test_transfer.py"),
            "01-electronics.T1.01a",
            "expected the package name to be the parent directory, not the file; check "
            "package_of's index, since a burn-down round is planned per package",
        )

    def test_package_totals_sum_both_graded_files(self):
        self.assertEqual(
            la.package_totals(self.RESULTS),
            [("01-electronics.T1.01a", 10), ("05-control.T2.05a", 5)],
            f"expected the two graded files of a package to be summed and ranked worst first "
            f"(7+3 then 5), with the clean package dropped; got "
            f"{la.package_totals(self.RESULTS)}",
        )

    def test_the_plan_is_paste_ready_and_ranked(self):
        text = la.plan_text(self.RESULTS, limit=6)
        for fragment, why in (("Burn down the next 2 packages", "the task line names how many"),
                              ("1. 01-electronics.T1.01a (10 weak assertions)", "rank 1 is the worst"),
                              ("Round total: 15 of 15 weak assertions.", "the total counts the tree")):
            self.assertIn(
                fragment, text,
                f"expected the pasted plan to contain {fragment!r} because {why}; got:\n{text}",
            )

    def test_the_plan_truncates_to_the_limit(self):
        self.assertEqual(
            len(la.package_totals(self.RESULTS)[:1]), 1,
            "expected the slice to keep rank 1 only; check package_totals still returns a list",
        )
        self.assertNotIn(
            "05-control.T2.05a", la.plan_text(self.RESULTS, limit=1),
            "expected a limit of 1 to leave the second package out; listing it would make the "
            "round longer than the task it was planned for",
        )

    def test_main_prints_the_plan_for_the_real_tree(self):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.assertEqual(
                la.main(["--plan", "1"]), 0,
                "expected --plan to exit 0 whether or not the tree still has findings; it is a "
                "planning command, not a check",
            )
        self.assertEqual(
            buffer.getvalue().strip(), la.plan_text(la.scan(), limit=1),
            "expected --plan to print exactly what plan_text renders; check main() still routes "
            "the flag through plan_text rather than a second formatter",
        )
        # The tree's own total decides which shape the plan takes: the empty-list message at zero,
        # a ranked list above it. Asserting one of the two would pin the test to a burn-down state.
        total = sum(la.counts(la.scan()).values())
        if total:
            self.assertIn(
                "Round total:", buffer.getvalue(),
                f"expected a ranked plan while {total} weak assertions remain in the tree; check "
                f"plan_text's non-empty branch",
            )
        else:
            self.assertIn(
                "Nothing left to burn down: 0 weak assertions", buffer.getvalue(),
                "expected the empty-tree message when the tree is clean; a ranked list for zero "
                "findings would look like work remaining",
            )

    def test_json_stdout_is_parseable_on_its_own(self):
        """`--json` promises clean JSON on stdout; the summary line is a log and belongs on stderr."""
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = la.main(["--json"])
        # The exit code is the ratchet's answer and is tested elsewhere; this test is only about
        # stdout being parseable on its own, whatever that answer is.
        self.assertIn(
            rc, (0, 1),
            f"expected --json to return the ratchet's verdict (0 or 1), got {rc} - a usage or "
            f"crash code here means the flag itself is broken",
        )
        payload = json.loads(out.getvalue())
        self.assertEqual(
            sorted(payload), ["baseline_problems", "findings", "total"],
            f"expected the JSON to carry exactly the three keys a caller reads; got "
            f"{sorted(payload)} - check the summary line has not been folded into stdout",
        )
        if rc == 0:
            self.assertEqual(
                payload["baseline_problems"], [],
                f"expected a zero exit with no baseline problems; got "
                f"{payload['baseline_problems']}",
            )
            self.assertIn(
                "held at the baseline", err.getvalue(),
                f"expected the human summary on stderr so a `| jq` pipeline stays parseable; got "
                f"{err.getvalue()!r}",
            )
        else:
            self.assertTrue(
                payload["baseline_problems"],
                "expected exit 1 to carry the baseline problems that caused it; an exit code "
                "with an empty findings list cannot be diagnosed",
            )

    def test_the_empty_plan_says_so_instead_of_listing_nothing(self):
        clean = {"exercises/00-foundations.T1.00a/test_behavior.py": []}
        self.assertEqual(
            la.plan_text(clean, limit=6),
            "Nothing left to burn down: 0 weak assertions in the tree. "
            "`--check` is the floor that keeps it there.",
            "expected a clean tree to produce that exact sentence, which names the floor that "
            "keeps it clean; an empty string would read as a broken command",
        )

    def test_a_non_positive_limit_is_a_usage_error(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            la.main(["--plan", "0"])
        self.assertEqual(
            caught.exception.code, 2,
            f"expected a usage exit code 2 for --plan 0, got {caught.exception.code}; a silent "
            f"empty plan would hide the bad argument",
        )


class TrackReportTests(unittest.TestCase):
    """The per-track table a burn-down round picks its next packages from."""

    RESULTS = {
        "exercises/00-foundations.T1.00a/test_behavior.py": ["a", "b"],
        "exercises/00-foundations.T2.00c/test_transfer.py": ["c"],
        "exercises/04-embedded.T1.04a/test_behavior.py": ["d"],
        "exercises/04-embedded.T1.04a/test_transfer.py": [],
    }

    def test_track_of_reads_the_package_prefix(self):
        self.assertEqual(
            la.track_of("exercises/00-foundations.T1.00a/test_behavior.py"), "00-foundations",
            "expected the track to be the package prefix before the first dot; check track_of's "
            "split, since the next round is chosen per track",
        )
        self.assertEqual(
            la.track_of("exercises/04-embedded.T1.04a/test_transfer.py"), "04-embedded",
            "expected a transfer file to report the same track as its behaviour sibling; a "
            "different answer would split one track's count in two",
        )

    def test_track_totals_group_and_sort_worst_first(self):
        totals = la.track_totals(self.RESULTS)
        self.assertEqual(
            list(totals), ["00-foundations", "04-embedded"],
            f"expected tracks ordered worst first; got {list(totals)} - check the sort key, "
            f"since the next round reads this table top-down",
        )
        self.assertEqual(
            totals["00-foundations"], {"total": 3, "files": 2},
            f"expected 00-foundations to total 3 findings across 2 files; got "
            f"{totals['00-foundations']} - check both files of the package are summed",
        )
        # The clean transfer file is not counted as a file still above zero.
        self.assertEqual(
            totals["04-embedded"], {"total": 1, "files": 1},
            f"expected the clean transfer file not to be counted as a file above zero; got "
            f"{totals['04-embedded']} - counting clean files would rank a track by size",
        )

    def test_the_baseline_records_the_same_tracks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "baseline.json")
            la.write_baseline(self.RESULTS, path)
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        self.assertEqual(
            payload["tracks"], la.track_totals(self.RESULTS),
            f"expected the baseline's track table to be the one from the same results; got "
            f"{payload['tracks']} - a stale table would report progress that did not happen",
        )
        self.assertEqual(
            sum(entry["total"] for entry in payload["tracks"].values()), payload["total"],
            f"expected the tracks to sum to the baseline total "
            f"({payload['total']}); got {sum(e['total'] for e in payload['tracks'].values())} - "
            f"check write_baseline computes both from one pass",
        )

    def test_the_ratchet_ignores_the_track_table(self):
        results = {"exercises/00-foundations.T1.00a/test_behavior.py": ["a"]}
        baseline = {"total": 1, "files": {"exercises/00-foundations.T1.00a/test_behavior.py": 1},
                    "tracks": {"00-foundations": {"total": 99, "files": 9}}}
        self.assertEqual(
            la.baseline_findings(results, baseline), [],
            "expected a doctored track table to be ignored by the ratchet; the floor is the "
            "per-file counts and the total, so a wrong track table must not fail a build",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
