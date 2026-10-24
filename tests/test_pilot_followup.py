#!/usr/bin/env python3
"""Tests for `scripts/pilot_followup.py` — the 7–14 day transfer check.

`docs/PILOT.md` puts the transfer question a week to a fortnight after the sitting, which is precisely
the delay at which a promise gets lost. The failures worth pinning are the ones that lose it quietly:

1. **A sitting with no due date** — an export in a folder and no record. This is the "forgotten", and
   `--due` has to report it rather than staying quiet because there is nothing to list.
2. **A question asked outside the window** — a due date on day 3 or day 30 measures memory or nothing,
   so both the record and a hand-written date are refused by name.
3. **A due date that never fires** — a record whose day has arrived but which is not listed as due,
   including the day itself and every day after it.
4. **A grade that does not stick** — the answer recorded but the participant still listed as due, so the
   results page would quote a transfer nobody made.

Run: `python3 tests/test_pilot_followup.py` (also wired into the CI verify step).
"""

import datetime as dt
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "pilot_followup.py")

spec = importlib.util.spec_from_file_location("pilot_followup", SCRIPT)
pf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf)

SITTING_DAY = "2026-10-24"


def run(argv):
    """`main` with its report captured, so the assertions can read what an operator reads."""
    with tempfile.TemporaryFile("w+", encoding="utf-8") as out:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, out
        try:
            code = pf.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr
        out.seek(0)
        return code, out.read()


class PilotFollowupTests(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.data)
        # The script reads `pilot-data/` beside the repository; here it reads a folder per test.
        self.saved = pf.DATA
        pf.DATA = self.data
        self.addCleanup(setattr, pf, "DATA", self.saved)

    def folder(self, name="2026-10-24-ab", export=False):
        path = os.path.join(self.data, name)
        os.makedirs(path, exist_ok=True)
        if export:
            with open(os.path.join(path, "mechalab-learning-log-2026-10-24.json"), "w", encoding="utf-8") as handle:
                json.dump({"schema": "mechalab.learning-log/1", "events": []}, handle)
        return path

    # ---- Recording the due date ----

    def test_add_writes_a_due_date_ten_days_out_by_default(self):
        path = self.folder()
        code, text = run(["--add", path, "--lesson", "P.1", "--today", SITTING_DAY])
        self.assertEqual(code, 0, "expected exit 0 when the record is written; check the folder exists first")
        self.assertIn("2026-11-03", text, "expected the default due date to be ten days after the sitting")
        with open(os.path.join(path, pf.RECORD), encoding="utf-8") as handle:
            record = json.load(handle)
        self.assertEqual(record["schema"], pf.SCHEMA, "expected the record to name its own schema for later readers")
        self.assertEqual(record["lesson"], "P.1", "expected the record to name the lesson the question is about")
        self.assertIsNone(record["result"], "expected a new record to be ungraded, not silently passed")
        self.assertIn("P.1", record["question"], "expected the question to name the concept it asks about")

    def test_a_window_outside_seven_to_fourteen_days_is_refused(self):
        path = self.folder()
        for days in (3, 30):
            code, text = run(["--add", path, "--lesson", "P.1", "--days", str(days), "--today", SITTING_DAY])
            self.assertEqual(code, 2, f"expected exit 2 for {days} days; the window is the protocol's, not a slider")
            self.assertIn("7–14", text, "expected the refusal to quote the protocol's window, not just say no")
        self.assertFalse(
            os.path.exists(os.path.join(path, pf.RECORD)),
            "expected no record to be written by a refused window; a wrong date is worse than none",
        )

    def test_add_needs_a_lesson_and_an_existing_folder(self):
        path = self.folder()
        code, text = run(["--add", path, "--today", SITTING_DAY])
        self.assertEqual(code, 2, "expected exit 2 without --lesson, since a question with no subject cannot be asked")
        self.assertIn("--lesson", text, "expected the refusal to name the flag it needs")
        code, text = run(["--add", os.path.join(self.data, "nope"), "--lesson", "P.1", "--today", SITTING_DAY])
        self.assertEqual(code, 2, "expected exit 2 for a folder that is not there, rather than a stray file")

    # ---- Who is due ----

    def test_an_export_with_no_record_is_the_sitting_that_gets_forgotten(self):
        self.folder(export=True)
        code, text = run(["--due", "--today", SITTING_DAY])
        self.assertEqual(code, 1, "expected exit 1: an export with no due date is the failure this check exists for")
        self.assertIn("will be forgotten", text, "expected the line to say what the consequence is, not just that a file is missing")

    def test_a_participant_inside_the_window_is_not_due_yet(self):
        path = self.folder(export=True)
        run(["--add", path, "--lesson", "P.1", "--today", SITTING_DAY])
        code, text = run(["--due", "--today", "2026-10-30"])
        self.assertEqual(code, 0, "expected exit 0 four days after the sitting: the window has not opened")
        self.assertIn("due in 4 day(s)", text, "expected the line to say how long is left, so the operator can plan")

    def test_the_due_day_and_every_day_after_it_are_due(self):
        path = self.folder(export=True)
        run(["--add", path, "--lesson", "P.1", "--today", SITTING_DAY])
        for day, phrase in (("2026-11-03", "due today"), ("2026-11-05", "overdue by 2 day(s)")):
            code, text = run(["--due", "--today", day])
            self.assertEqual(code, 1, f"expected exit 1 on {day}; a due date that only fires late is a reminder lost")
            self.assertIn(phrase, text, f"expected {day} to report {phrase!r}, so the operator knows how late it is")

    def test_a_hand_written_date_outside_the_window_is_flagged(self):
        path = self.folder(export=True)
        record = {
            "schema": pf.SCHEMA,
            "folder": "2026-10-24-ab",
            "lesson": "P.1",
            "recordedOn": SITTING_DAY,
            "dueOn": "2026-10-27",
            "question": "?",
            "result": None,
        }
        with open(os.path.join(path, pf.RECORD), "w", encoding="utf-8") as handle:
            json.dump(record, handle)
        code, text = run(["--due", "--today", "2026-10-30"])
        self.assertEqual(code, 1, "expected exit 1 for a three-day transfer: it measures memory, not understanding")
        self.assertIn("7–14", text, "expected the finding to quote the window the date fell outside")

    def test_a_folder_with_neither_export_nor_record_is_quiet(self):
        self.folder()
        code, text = run(["--due", "--today", SITTING_DAY])
        self.assertEqual(code, 0, "expected exit 0 for a folder that has nothing to follow up yet")
        self.assertIn("nothing to follow up yet", text, "expected the line to say why the folder is not a finding")

    def test_no_pilot_data_at_all_is_not_an_error(self):
        code, text = run(["--due", "--today", SITTING_DAY])
        self.assertEqual(code, 0, "expected exit 0 before the first participant, when pilot-data/ has no folders")
        self.assertIn("nothing to follow up", text, "expected the empty state to say so instead of failing")

    # ---- Grading the answer ----

    def test_grading_records_the_verdict_and_takes_the_participant_off_the_list(self):
        path = self.folder(export=True)
        run(["--add", path, "--lesson", "P.1", "--today", SITTING_DAY])
        code, text = run(["--grade", path, "pass", "--note", "picked the right formula unprompted", "--today", "2026-11-04"])
        self.assertEqual(code, 0, "expected exit 0 once the verdict is written")
        self.assertIn("transfer pass", text, "expected the confirmation to name the verdict it recorded")
        code, text = run(["--due", "--today", "2026-11-05"])
        self.assertEqual(code, 0, "expected exit 0 after grading: a transferred participant is not a finding")
        self.assertIn("picked the right formula unprompted", text, "expected the note to be kept for the results page")

    def test_grading_without_a_record_says_what_to_do_first(self):
        path = self.folder(export=True)
        code, text = run(["--grade", path, "fail", "--today", "2026-11-04"])
        self.assertEqual(code, 2, "expected exit 2 for a folder with no record; the due date comes at the sitting")
        self.assertIn("--add", text, "expected the refusal to name the command that creates the record")

    def test_grading_without_a_verdict_is_refused(self):
        path = self.folder(export=True)
        run(["--add", path, "--lesson", "P.1", "--today", SITTING_DAY])
        code, text = run(["--grade", path, "--today", "2026-11-04"])
        self.assertEqual(code, 2, "expected exit 2 without pass or fail; a grade that could be guessed is not a grade")
        self.assertIn("pass or fail", text, "expected the refusal to spell out the two verdicts")


if __name__ == "__main__":
    unittest.main(verbosity=2)
