#!/usr/bin/env python3
"""Tests for `scripts/pilot_results.py` and the published `docs/pilot-results.md`.

The results page is the one pilot page a reader cannot check for themselves — the folders behind it are
git-ignored — so the failures worth pinning are the ones that make a typed number indistinguishable from
a measured one:

1. **A count that is typed.** The page has to be what the folders render, and `--check` has to fail when
   somebody edits it by hand.
2. **A participant who does not exist.** A record with no export, with a question unanswered, or with a
   claim its own evidence refuses must not be counted — and the page says how many it left out.
3. **A stage nobody chose.** The stage table groups sittings by the record's `stage`, so a default that
   quietly files everyone under Smoke would publish the wrong funnel.
4. **A table that states a fact.** The top stuck points, the per-lesson help split and the transfer
   counts are read from the records, not summarised by hand; each is checked here with a real record.

Run: `python3 tests/test_pilot_results.py` (also run by `npm run check:pilot`).
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
SCRIPT = os.path.join(ROOT, "scripts", "pilot_results.py")

spec = importlib.util.spec_from_file_location("pilot_results", SCRIPT)
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)

DAY = "2026-10-24"


def run(argv):
    """`main` with both streams captured, so a refusal can be read as the operator reads it."""
    with tempfile.TemporaryFile("w+", encoding="utf-8") as out:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, out
        try:
            code = pr.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr
        out.seek(0)
        return code, out.read()


def quiet(module, argv):
    """Run the kit's own command with its operator chatter discarded: this suite asserts on the page."""
    with open(os.devnull, "w", encoding="utf-8") as sink:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = sink, sink
        try:
            return module.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr


def export_payload(lessons=("P.1",), hint_level=0, verified=True, seconds=540):
    """A real export: one sitting, its opens and runs, and what it counted."""
    events = []
    for index, lesson in enumerate(lessons):
        events.append({"kind": "lesson_open", "lesson": lesson, "t": index})
    events.append({"kind": "run", "lesson": lessons[0], "t": 1000})
    if hint_level:
        events.append({"kind": "hint", "lesson": lessons[0], "level": hint_level, "t": 2000})
    if verified:
        events.append({"kind": "verified", "lesson": lessons[0], "t": 3000})
    return {
        "schema": "mechalab.learning-log/1",
        "events": events,
        "sittings": [{"start": 0, "end": seconds * 1000, "runs": 1, "lessons": list(lessons)}],
    }


class PilotResultsTests(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.data)
        self.saved = pr.DATA
        pr.DATA = self.data
        self.addCleanup(setattr, pr, "DATA", self.saved)

    def sitting(
        self,
        initials="ab",
        stage="smoke",
        finished=True,
        verified=True,
        lessons=("P.1",),
        hint_level=0,
        stops=(),
    ):
        """One participant folder, built the way an operator builds it: the commands, not hand-written JSON."""
        folder = os.path.join(self.data, f"{DAY}-{initials}")
        os.makedirs(folder, exist_ok=True)
        self.assertEqual(
            quiet(pr.pilot_sitting, ["--new", folder, "--date", DAY, "--stage", stage]),
            0,
            "expected --new to open a record with its stage, which is what the results table groups by",
        )
        for minute, kind, page, tried in stops:
            self.assertEqual(
                quiet(
                    pr.pilot_sitting,
                    ["--stop", folder, "--minute", str(minute), "--kind", kind, "--page", page, "--tried", tried],
                ),
                0,
                "expected --stop to log a stop, since the top-10 table is built from them",
            )
        path = os.path.join(folder, f"mechalab-learning-log-{DAY}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(export_payload(lessons=lessons, hint_level=hint_level, verified=verified), handle)
        self.assertEqual(
            quiet(pr.pilot_sitting, ["--finish", folder, "--elapsed", "40"]),
            0,
            "expected --finish to close the record from a clean export",
        )
        answer = ["--debrief", folder, "--finished", "yes", "--finished-minutes", "33", "--run-verify", "yes"]
        if not finished:
            answer = ["--debrief", folder, "--finished", "no"]
        self.assertEqual(
            quiet(pr.pilot_sitting, answer),
            0,
            "expected the debrief to answer the graded loop, which is what makes the row countable",
        )
        return folder

    def render(self):
        return pr.render(*pr.participants())

    # ---- The page is what the folders say ----

    def test_the_committed_page_is_current(self):
        code, out = run(["--check"])
        self.assertEqual(
            code,
            0,
            "expected docs/pilot-results.md to match what the folders render; run scripts/pilot_results.py",
        )
        self.assertIn("is current", out, "expected the check to say the page is current, not only exit 0")

    def test_a_typed_count_is_caught_by_the_check(self):
        target = os.path.join(self.data, "results.md")
        self.assertEqual(run(["--out", target])[0], 0, "expected --out to write a page beside the folders")
        with open(target, "a", encoding="utf-8") as handle:
            handle.write("\n**Participants (non-author): 3.**\n")
        code, out = run(["--check", "--out", target])
        self.assertEqual(code, 1, "expected a hand-edited count to fail the staleness check")
        self.assertIn("stale", out, "expected the check to say the page is stale rather than differ quietly")

    # ---- Who is counted ----

    def test_a_counted_sitting_becomes_one_participant(self):
        self.sitting()
        page = self.render()
        self.assertIn(
            "**Participants (non-author): 1.**",
            page,
            "expected the page's count to come from the folders, since a typed count is the failure it replaces",
        )
        self.assertIn(
            "| Smoke (Track P + Stage 0) | 1 | 1 |",
            page,
            "expected the finished sitting to be one started and one finished in its stage row",
        )

    def test_a_record_with_no_export_is_left_out_and_named(self):
        folder = os.path.join(self.data, f"{DAY}-cd")
        os.makedirs(folder, exist_ok=True)
        quiet(pr.pilot_sitting, ["--new", folder, "--date", DAY])
        page = self.render()
        self.assertIn("**Participants (non-author): 0.**", page, "expected an unbacked record not to be counted")
        self.assertIn(
            "**1 record not counted**",
            page,
            "expected the page to say how many records it left out, rather than looking complete with zero",
        )

    def test_a_claim_its_evidence_refuses_is_not_published(self):
        # Closed honestly (an unverified export, so `finished` stays unanswered), then made to claim a finish
        # the way a hand edit would: the page still must not publish it.
        folder = self.sitting(verified=False, finished=False)
        with open(os.path.join(folder, "sitting.json"), encoding="utf-8") as handle:
            record = json.load(handle)
        record.update({"finished": True, "run_verify": True, "finished_minutes": 33})
        with open(os.path.join(folder, "sitting.json"), "w", encoding="utf-8") as handle:
            json.dump(record, handle)
        page = self.render()
        self.assertIn(
            "**Participants (non-author): 0.**",
            page,
            "expected `finished` without a verified export to keep the sitting off the published page",
        )
        self.assertIn("not counted", page, "expected the page to name the record it refused to quote")

    def test_the_stage_comes_from_the_record(self):
        self.sitting(initials="ab", stage="smoke")
        self.sitting(initials="cd", stage="p1")
        page = self.render()
        self.assertIn(
            "| Smoke (Track P + Stage 0) | 1 | 1 |", page, "expected the default-stage sitting in the Smoke row"
        )
        self.assertIn(
            "| P1 (Tier 1) | 1 | 1 |",
            page,
            "expected the second sitting in P1 rather than folded into Smoke, since the stage is the record's",
        )
        self.assertIn("| P2 (Tier 2 Core) | 0 | 0 |", page, "expected a stage with no sittings to stay a zero row")

    def test_an_early_end_is_published_as_a_finding(self):
        self.sitting(finished=False)
        page = self.render()
        self.assertIn(
            "ended early (a finding, published as one)",
            page,
            "expected a sitting that ended early to be counted and described, not quietly dropped",
        )

    # ---- The tables ----

    def test_stops_become_the_top_ten_most_frequent_first(self):
        self.sitting(
            stops=[
                (6, "link", "README", "scrolled for Start"),
                (9, "link", "README", "re-read the top"),
                (14, "error", "P.1", "could not read the traceback"),
            ]
        )
        page = self.render()
        self.assertIn(
            "| 1 | `README` | link | 2 | — |",
            page,
            "expected the stop seen twice to be the first row, since the table is ordered by count",
        )
        self.assertIn(
            "| 2 | `P.1` | error | 1 | — |",
            page,
            "expected the single occurrence to follow, keyed by page and kind rather than by participant",
        )

    def test_the_top_ten_stops_at_ten(self):
        stops = [(minute, "tool", f"page-{index:02d}", "tried") for index, minute in enumerate(range(1, 13))]
        self.sitting(stops=stops)
        page = self.render()
        table = page.split("## Top 10 stuck points")[1]
        rows = [
            line
            for line in table.splitlines()
            if line.startswith("| ") and not line.startswith("| #") and not line.startswith("| ---")
        ]
        self.assertEqual(
            len(rows), 10, "expected the top-10 table to stop at ten rows, since the count is what it is named for"
        )
        self.assertNotIn("page-11", page, "expected the eleventh stuck point to be left off rather than appended")

    def test_help_per_lesson_is_only_for_a_single_lesson_sitting(self):
        self.sitting(initials="ab", lessons=("P.1",), hint_level=2)
        self.sitting(initials="cd", lessons=("P.2", "P.3"))
        page = self.render()
        self.assertIn(
            "| `P.1` | 1 | 0 | 0 | 1 | 0 | 0 |",
            page,
            "expected the hint-2 sitting to appear under P.1, in the hint_2 column",
        )
        self.assertNotIn("`P.2`", page, "expected a two-lesson sitting not to be apportioned to one of its pages")
        self.assertIn(
            "1 sitting(s) covered more than one lesson",
            page,
            "expected the page to say why a two-lesson sitting is missing from the help table",
        )

    def test_a_graded_transfer_fills_the_transfer_table(self):
        folder = self.sitting()
        quiet(pr.pilot_followup, ["--add", folder, "--lesson", "P.1"])
        quiet(pr.pilot_followup, ["--grade", folder, "pass", "--note", "picked the right formula unprompted"])
        page = self.render()
        self.assertIn(
            "| 1 | 1 | 0 | 0 |",
            page,
            "expected the graded transfer to be one asked and one passed, read from the follow-up record",
        )

    def test_the_author_walk_is_inlined_once(self):
        page = self.render()
        self.assertEqual(
            page.count("## Author walk"), 1, "expected the walk to be inlined exactly once, not duplicated per render"
        )
        self.assertIn(
            "3 min 52 s",
            page,
            "expected the walk's measured numbers to reach the page, so its narrative is not lost when generated",
        )


if __name__ == "__main__":
    unittest.main()
