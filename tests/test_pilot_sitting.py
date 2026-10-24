#!/usr/bin/env python3
"""Tests for `scripts/pilot_sitting.py` — the sitting record and its evidence rules.

The failures worth pinning are the ones that would let the results page quote something nobody measured:

1. **A sitting recorded as finished without a verified export.** This is the whole reason the record
   exists: `finished: true` has to mean the graded loop passed, not that the observer felt it did.
2. **Minutes that drifted from the export.** `active_minutes` is copied from the export's sittings; a
   later hand-edit (or an estimate typed at the start) must be caught against the file, and
   `overhead_minutes` must still be `elapsed - active`.
3. **A stop the top-10 table cannot use.** No minute, no page, no kind — each refused, and the kind
   comes from the protocol's vocabulary.
4. **A participant counted with no evidence.** `--status` ignores a folder with a record and no export,
   and says `N = 0` rather than printing an empty table that reads like a result.
5. **A help type the export contradicts** — `hint_2` with no hint in the log.

The issue template that files a one-off observation is checked here too, from the other direction: it
has to carry *this record's* vocabulary, so an observation and a pilot row are the same data rather
than two forms that disagree about what "stuck" was.

Run: `python3 tests/test_pilot_sitting.py` (also run by `npm run check:pilot`).
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
SCRIPT = os.path.join(ROOT, "scripts", "pilot_sitting.py")

spec = importlib.util.spec_from_file_location("pilot_sitting", SCRIPT)
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

DAY = "2026-10-24"


def run(argv):
    """`main` with its report captured, so the assertions read what an operator reads."""
    with tempfile.TemporaryFile("w+", encoding="utf-8") as out:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, out
        try:
            code = ps.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr
        out.seek(0)
        return code, out.read()


def run_split(argv):
    """`(code, stdout, stderr)` separately: a rendered body must reach stdout and nothing else."""
    with tempfile.TemporaryFile("w+", encoding="utf-8") as out, tempfile.TemporaryFile(
        "w+", encoding="utf-8"
    ) as err:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, err
        try:
            code = ps.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr
        out.seek(0)
        err.seek(0)
        return code, out.read(), err.read()


def export_payload(seconds=540, runs=1, verified=True, hint_level=0):
    """A minimal but real export: one sitting, the runs inside it, and what it counted."""
    events = [{"kind": "lesson_open", "lesson": "P.1", "t": 0}]
    for index in range(runs):
        events.append({"kind": "run", "lesson": "P.1", "t": 1000 + index})
    if hint_level:
        events.append({"kind": "hint", "lesson": "P.1", "level": hint_level, "t": 2000})
    if verified:
        events.append({"kind": "verified", "lesson": "P.1", "t": 3000})
    return {
        "schema": "mechalab.learning-log/1",
        "events": events,
        "sittings": [
            {
                "start": 0,
                "end": seconds * 1000,
                "runs": runs,
                "lessons": ["P.1"],
            }
        ],
    }


class PilotSittingTests(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.data)
        self.saved = ps.DATA
        ps.DATA = self.data
        self.addCleanup(setattr, ps, "DATA", self.saved)

    def folder(self, name=f"{DAY}-ab"):
        path = os.path.join(self.data, name)
        os.makedirs(path, exist_ok=True)
        return path

    def opened(self, name=f"{DAY}-ab"):
        path = self.folder(name)
        code, _ = run(["--new", path, "--date", DAY])
        self.assertEqual(code, 0, "expected --new to open a record; a refusal means the template is wrong")
        return path

    def with_export(self, folder, **kwargs):
        path = os.path.join(folder, f"mechalab-learning-log-{DAY}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(export_payload(**kwargs), handle)
        return path

    def read(self, folder):
        with open(os.path.join(folder, "sitting.json"), encoding="utf-8") as handle:
            return json.load(handle)

    def write(self, folder, record):
        with open(os.path.join(folder, "sitting.json"), "w", encoding="utf-8") as handle:
            json.dump(record, handle)

    def finished_sitting(self, **export_kwargs):
        """The happy path: opened, one stop logged, closed from a verified export."""
        folder = self.opened()
        code, _ = run(
            [
                "--stop", folder, "--minute", "6", "--kind", "link",
                "--page", "README", "--tried", "scrolled looking for Start",
                "--resolved", "author pointed at the heading",
            ]
        )
        self.assertEqual(code, 0, "expected --stop to log the first stop; a refusal loses the row")
        self.with_export(folder, **export_kwargs)
        code, _ = run(["--finish", folder, "--elapsed", "40"])
        self.assertEqual(code, 0, "expected --finish to close a record from a clean export")
        return folder, self.read(folder)

    # ---- Opening a record ----

    def test_new_invents_nothing(self):
        folder = self.opened()
        record = self.read(folder)
        self.assertEqual(record["schema"], ps.SCHEMA, "expected the record to carry the sitting schema name")
        self.assertEqual(record["date"], DAY, "expected --date to be the day recorded, not today's date")
        self.assertEqual(record["initials"], "ab", "expected the initials to come from the folder name")
        for field in ("active_minutes", "elapsed_minutes", "help", "verified", "finished", "run_verify"):
            self.assertIsNone(
                record[field],
                f"expected {field} to start unanswered, because a guessed value is not a measurement",
            )
        self.assertEqual(record["stops"], [], "expected no stops yet; the observer adds them as they happen")
        self.assertIsNone(
            record["background"]["has_coded"],
            "expected the background to be unanswered until the observer asks, not defaulted to no",
        )

    def test_new_refuses_to_overwrite_a_record(self):
        folder = self.opened()
        code, out = run(["--new", folder, "--date", DAY])
        self.assertEqual(code, 2, "expected --new to refuse a second record rather than silently reset one")
        self.assertIn("--force", out, "expected the refusal to name --force, which is how a reset is asked for")
        code, _ = run(["--new", folder, "--date", DAY, "--force"])
        self.assertEqual(code, 0, "expected --force to be the one way to overwrite a wrong record")

    def test_new_takes_the_date_from_the_folder_and_refuses_a_bad_one(self):
        path = self.folder(f"{DAY}-cd")
        code, _ = run(["--new", path])
        self.assertEqual(code, 0, "expected the date to be read from a folder that starts with it")
        self.assertEqual(self.read(path)["date"], DAY, "expected the folder's own day to be recorded")
        code, out = run(["--new", self.folder("nodate-cd"), "--date", "last-tuesday"])
        self.assertEqual(code, 2, "expected a date that is not YYYY-MM-DD to be refused")
        self.assertIn("YYYY-MM-DD", out, "expected the refusal to say the shape it needs")

    # ---- Logging a stop ----

    def test_stop_appends_a_countable_row(self):
        folder = self.opened()
        code, _ = run(
            ["--stop", folder, "--minute", "6", "--kind", "link", "--page", "README",
             "--tried", "scrolled for Start", "--resolved", "pointed at the heading"]
        )
        self.assertEqual(code, 0, "expected a well-formed stop to be accepted")
        stop = self.read(folder)["stops"][0]
        self.assertEqual(stop["minute"], 6, "expected the minute to be kept so the stall can be ordered")
        self.assertEqual(stop["kind"], "link", "expected the kind to be kept so the top-10 can group it")
        self.assertEqual(
            stop["resolved"], "pointed at the heading", "expected what unblocked it to be kept with the stop"
        )

    def test_a_stop_without_a_kind_a_page_or_a_tried_line_is_refused(self):
        folder = self.opened()
        code, out = run(["--stop", folder, "--minute", "6", "--page", "README", "--tried", "looked"])
        self.assertEqual(code, 2, "expected a stop with no kind to be refused, not filed under a guess")
        self.assertIn("--kind", out, "expected the refusal to name the missing flag")
        code, out = run(["--stop", folder, "--minute", "6", "--kind", "vibes", "--page", "README", "--tried", "x"])
        self.assertEqual(code, 2, "expected a kind outside the protocol's vocabulary to be refused")
        self.assertIn("vibes", out, "expected the refusal to quote the bad kind so it can be fixed")
        code, out = run(["--stop", folder, "--minute", "6", "--kind", "tool", "--page", " ", "--tried", "x"])
        self.assertEqual(code, 2, "expected a stop with no page to be refused, because the table joins pages")
        self.assertIn("--page", out, "expected the refusal to name the missing page")
        self.assertEqual(self.read(folder)["stops"], [], "expected refused stops to write nothing at all")

    def test_stop_before_new_is_a_usage_error(self):
        folder = self.folder()
        code, out = run(["--stop", folder, "--minute", "3", "--kind", "tool", "--page", "P.1", "--tried", "x"])
        self.assertEqual(code, 2, "expected --stop in a folder with no record to be a usage error")
        self.assertIn("--new", out, "expected the error to say which command opens the record")

    # ---- Closing from the export ----

    def test_finish_copies_the_export_and_does_the_arithmetic(self):
        _, record = self.finished_sitting()
        self.assertEqual(record["active_minutes"], 9, "expected 540 s of sitting to read as 9 active minutes")
        self.assertEqual(record["elapsed_minutes"], 40, "expected the timer's number to be kept as elapsed")
        self.assertEqual(record["overhead_minutes"], 31, "expected overhead to be elapsed minus active")
        self.assertEqual(record["runs"], 1, "expected the run count to come from the export, not the observer")
        self.assertIs(record["verified"], True, "expected a verified export to record verified as true")
        self.assertEqual(
            record["export"],
            f"mechalab-learning-log-{DAY}.json",
            "expected the record to name the export it was closed from",
        )

    def test_finish_without_an_export_refuses(self):
        folder = self.opened()
        code, out = run(["--finish", folder, "--elapsed", "40"])
        self.assertEqual(code, 2, "expected --finish with no export to refuse: the minutes would be invented")
        self.assertIn("Export Learning Log", out, "expected the refusal to name the button to press")

    def test_finish_refuses_an_export_that_cannot_be_logged(self):
        folder = self.opened()
        path = os.path.join(folder, f"mechalab-learning-log-{DAY}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"schema": "mechalab.learning-log/1", "events": []}, handle)
        code, out = run(["--finish", folder, "--elapsed", "40"])
        self.assertEqual(code, 2, "expected an export the preflight fails to stop the record closing")
        self.assertIn("no events", out, "expected the export's own finding to be passed through")
        self.assertIsNone(
            self.read(folder)["active_minutes"],
            "expected a refused export to leave the record untouched rather than half-filled",
        )

    def test_active_minutes_longer_than_elapsed_is_refused(self):
        folder = self.opened()
        self.with_export(folder, seconds=2700)  # 45 active minutes
        code, out = run(["--finish", folder, "--elapsed", "40"])
        self.assertEqual(code, 2, "expected more active than elapsed minutes to be refused as a contradiction")
        self.assertIn("one of the two numbers is wrong", out, "expected the refusal to say which pair disagrees")

    def test_a_person_hint_becomes_the_help_type(self):
        folder = self.opened()
        self.with_export(folder)
        code, _ = run(["--finish", folder, "--elapsed", "40", "--person-hint", "1"])
        self.assertEqual(code, 0, "expected a sitting with one outside hint to close normally")
        record = self.read(folder)
        self.assertEqual(record["help"], "person", "expected an outside hint to outrank the in-course hint type")
        self.assertEqual(record["person_hints"], 1, "expected the count to be kept for the help budget")

    # ---- The claims the evidence has to support ----

    def test_a_finished_sitting_with_a_verified_export_passes(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record.update({"finished": True, "run_verify": True, "finished_minutes": 33})
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 0, "expected a finished row with a verified export to be filed")
        self.assertIn("[PASS]", out, "expected the audit to print a pass rather than only stay quiet")

    def test_finished_without_a_verified_export_is_refused(self):
        folder, _ = self.finished_sitting(verified=False)
        record = self.read(folder)
        record.update({"finished": True, "run_verify": True, "finished_minutes": 33})
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected finished to be refused when the export verifies nothing")
        self.assertIn("verifies nothing", out, "expected the failure to say the claim has no evidence")

    def test_finished_without_the_graded_loop_is_refused(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record.update({"finished": True, "run_verify": False, "finished_minutes": 33})
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected finished to be refused when the graded loop did not pass")
        self.assertIn("run_verify", out, "expected the failure to name the field that is missing")

    def test_hand_edited_active_minutes_are_caught_against_the_export(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record["active_minutes"] = 12
        record["overhead_minutes"] = 28
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected a hand-edited active_minutes to be caught on the next audit")
        self.assertIn("the export's sittings say 9", out, "expected the failure to quote the measured number")

    def test_overhead_that_is_not_the_difference_is_caught(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record["overhead_minutes"] = 20
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected overhead that is not elapsed minus active to be refused")
        self.assertIn("40 elapsed − 9 active = 31", out, "expected the failure to do the arithmetic out loud")

    def test_a_help_type_the_export_contradicts_is_refused(self):
        folder = self.opened()
        self.with_export(folder)  # no hint events
        code, _ = run(["--finish", folder, "--elapsed", "40"])
        self.assertEqual(code, 0, "expected closing from an export with no hints to succeed")
        record = self.read(folder)
        record["help"] = "hint_2"
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected a hint_2 claim to be refused when the log records no hint")
        self.assertIn("no hint", out, "expected the failure to say the log and the sheet disagree")

    def test_numbers_with_no_export_in_the_folder_are_refused(self):
        folder = self.opened()
        record = self.read(folder)
        record.update({"active_minutes": 9, "verified": True})
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected export numbers with no export behind them to be refused")
        self.assertIn("no export", out, "expected the failure to say what is missing from the folder")

    def test_an_open_sitting_is_not_a_failure(self):
        folder = self.opened()
        code, out = run(["--check", folder])
        self.assertEqual(code, 0, "expected an untouched record to audit clean, because it claims nothing")
        self.assertIn("open", out, "expected the audit to say the sitting is open rather than look complete")

    def test_a_stop_the_top_ten_cannot_use_is_refused(self):
        folder = self.opened()
        record = self.read(folder)
        record["stops"] = [{"minute": 6, "kind": "link", "page": "", "tried": "x"}]
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected a stop with no page to be refused when the record is read back")
        self.assertIn("names no page", out, "expected the failure to name the field that is empty")

    def test_a_finished_sitting_that_says_it_reached_the_lesson_with_no_minute_is_refused(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record["reached_lesson_1"] = True
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected `reached_lesson_1: true` with no minute to be refused")
        self.assertIn("is the finding", out, "expected the failure to say the minute is the measurement")

    def test_a_sitting_that_did_not_reach_the_lesson_cannot_carry_a_minute(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record.update({"reached_lesson_1": False, "minutes_to_lesson_1": 4})
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected `reached: no` beside a find minute to be refused as a contradiction")
        self.assertIn("one of the two is wrong", out, "expected the failure to name the disagreeing pair")

    def test_a_course_bug_without_a_page_is_refused(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record["course_bug"] = {"yes": True, "page": "", "line": ""}
        self.write(folder, record)
        code, out = run(["--check", folder])
        self.assertEqual(code, 1, "expected a course bug with no page to be refused, since it becomes no fix")
        self.assertIn("becomes no fix", out, "expected the failure to say why the page matters")

    # ---- Counting ----

    def test_status_counts_only_a_sitting_with_an_export_behind_it(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record["finished"] = False
        self.write(folder, record)
        # A second folder with a record and no export: it is not a participant yet.
        other = self.opened(f"{DAY}-cd")
        code, out = run(["--status"])
        self.assertEqual(code, 1, "expected an unbacked record to make --status exit non-zero")
        self.assertIn("not counted", out, "expected the unbacked folder to be named as uncounted")
        self.assertIn("N (non-author) = 1", out, "expected only the sitting with an export to be counted")
        self.assertNotIn("cd", out.split("N (non-author) = 1")[1], "expected the uncounted folder to stay off the count")
        self.assertTrue(os.path.isdir(other), "expected the unbacked folder to stay on disk for the operator")

    def test_status_with_nothing_says_zero_out_loud(self):
        code, out = run(["--status"])
        self.assertEqual(code, 0, "expected an empty pilot to report zero without failing")
        self.assertIn("N (non-author) = 0", out, "expected the count to be printed when it is zero, not omitted")
        self.assertIn("stays the template", out, "expected the output to say the results page is unchanged")

    def test_check_with_no_folders_is_a_pass_not_an_empty_table(self):
        code, out = run(["--check"])
        self.assertEqual(code, 0, "expected auditing nothing to pass rather than read as an empty result")
        self.assertIn("nothing is claimed", out, "expected the pass line to say why the table is empty")

    def test_the_two_counts_agree_on_an_unanswered_record(self):
        folder, _ = self.finished_sitting()  # closed from the export, but `finished` is still unanswered
        code, out = run(["--check", folder, "--json"])
        self.assertEqual(code, 0, "expected an unanswered record to audit clean, since it claims nothing yet")
        self.assertEqual(
            json.loads(out)["participants"],
            0,
            "expected an unanswered `finished` not to count as a participant on the results page",
        )
        code, out = run(["--status"])
        self.assertEqual(code, 0, "expected --status to pass while nothing is claimed")
        self.assertIn("N (non-author) = 0", out, "expected --status to agree with --check about the count")

    def test_json_reports_the_same_verdict(self):
        folder, _ = self.finished_sitting()
        record = self.read(folder)
        record.update({"finished": True, "run_verify": True, "finished_minutes": 33})
        self.write(folder, record)
        code, out = run(["--check", folder, "--json"])
        self.assertEqual(code, 0, "expected the JSON mode to reach the same verdict as the human one")
        payload = json.loads(out)
        self.assertEqual(payload["failures"], 0, "expected no failures in the JSON report for a clean row")
        self.assertEqual(payload["participants"], 1, "expected the JSON report to count the backed sitting")


class DebriefTests(unittest.TestCase):
    """`--debrief` answers the questions the export cannot, without hand-editing `sitting.json`.

    The failure this replaces is a typo in a JSON file that nobody audits until `--check` — and the one
    this guards is the opposite: an answer that would make the record unfilable being written anyway, so
    the operator discovers it half an hour after the participant has gone. So the copy is audited first,
    and a refused debrief leaves the record exactly as it was.
    """

    def setUp(self):
        self.data = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.data)
        self.saved = ps.DATA
        ps.DATA = self.data
        self.addCleanup(setattr, ps, "DATA", self.saved)

    def closed(self, **export_kwargs):
        folder = os.path.join(self.data, f"{DAY}-ab")
        os.makedirs(folder, exist_ok=True)
        self.assertEqual(
            run(["--new", folder, "--date", DAY])[0], 0, "expected --new to open the sitting record in its folder"
        )
        with open(os.path.join(folder, f"mechalab-learning-log-{DAY}.json"), "w", encoding="utf-8") as handle:
            json.dump(export_payload(**export_kwargs), handle)
        self.assertEqual(
            run(["--finish", folder, "--elapsed", "40"])[0], 0, "expected --finish to close the record from the export"
        )
        return folder

    def read(self, folder):
        with open(os.path.join(folder, "sitting.json"), encoding="utf-8") as handle:
            return json.load(handle)

    def test_the_three_answers_land_in_one_command(self):
        folder = self.closed()
        code, out = run(
            ["--debrief", folder, "--understood", "partly",
             "--error-quote", "IndexError: list index out of range",
             "--knew-next", "no", "--their-fix", "say what the red line means"]
        )
        self.assertEqual(code, 0, "expected a debrief with three answers to be accepted in one command")
        record = self.read(folder)
        self.assertEqual(
            record["understood_error"],
            'partly — "IndexError: list index out of range"',
            "expected the answer to keep the message it is about, since a bare `partly` cannot be acted on",
        )
        self.assertIs(record["knew_next"], False, "expected `no` to be stored as a boolean, not the string")
        self.assertEqual(
            record["their_fix"], "say what the red line means", "expected the fix to be kept in their words"
        )
        self.assertIsNone(
            record["finished"], "expected a debrief not to answer `finished`; an unasked question is not a no"
        )
        self.assertIn("still unanswered", out, "expected the command to say what is left rather than look complete")

    def test_a_debrief_with_no_answers_is_a_usage_error(self):
        folder = self.closed()
        code, out = run(["--debrief", folder])
        self.assertEqual(code, 2, "expected an empty debrief to be a usage error rather than a silent success")
        self.assertIn("--understood", out, "expected the refusal to name the flags that answer something")

    def test_a_quote_needs_the_answer_it_belongs_to(self):
        folder = self.closed()
        code, out = run(["--debrief", folder, "--error-quote", "TypeError"])
        self.assertEqual(code, 2, "expected an error quote with no `--understood` to be refused")
        self.assertIn("--understood", out, "expected the refusal to say which flag the quote belongs to")

    def test_a_debrief_before_the_export_is_refused(self):
        folder = os.path.join(self.data, f"{DAY}-cd")
        os.makedirs(folder, exist_ok=True)
        run(["--new", folder, "--date", DAY])
        code, out = run(["--debrief", folder, "--their-fix", "a diagram"])
        self.assertEqual(code, 2, "expected a debrief with no export to be refused, since it describes no numbers")
        self.assertIn("--finish", out, "expected the refusal to say which command comes first")
        self.assertEqual(self.read(folder)["their_fix"], "", "expected the refused answer not to be written")

    def test_finished_without_the_graded_loop_writes_nothing(self):
        folder = self.closed()
        before = self.read(folder)
        code, out = run(["--debrief", folder, "--finished", "yes", "--finished-minutes", "33"])
        self.assertEqual(code, 1, "expected `finished yes` with no graded loop to be refused at the debrief")
        self.assertIn("run_verify", out, "expected the refusal to name the answer that is missing")
        self.assertEqual(
            self.read(folder), before, "expected a refused debrief to leave the record exactly as it was"
        )

    def test_finished_without_a_finish_minute_is_refused(self):
        folder = self.closed()
        code, out = run(["--debrief", folder, "--finished", "yes", "--run-verify", "yes"])
        self.assertEqual(code, 1, "expected `finished yes` with no finish minute to be refused")
        self.assertIn("finished_minutes", out, "expected the refusal to name the missing minute")

    def test_the_find_and_its_minute_are_written_together(self):
        folder = self.closed()
        code, _ = run(["--debrief", folder, "--reached-lesson-1", "yes", "--minutes-to-lesson-1", "4"])
        self.assertEqual(code, 0, "expected the first success criterion to be answerable in the same command")
        record = self.read(folder)
        self.assertIs(record["reached_lesson_1"], True, "expected the answer to be stored as a boolean")
        self.assertEqual(record["minutes_to_lesson_1"], 4, "expected the minute it took to be kept as measured")
        code, _ = run(["--check", folder])
        self.assertEqual(code, 0, "expected a record with a find and its minute to pass the audit")

    def test_a_find_minute_without_the_find_is_a_usage_error(self):
        folder = self.closed()
        code, out = run(["--debrief", folder, "--minutes-to-lesson-1", "4"])
        self.assertEqual(code, 2, "expected a find minute with no `--reached-lesson-1` to be a usage error")
        self.assertIn("--reached-lesson-1", out, "expected the refusal to name the answer the minute belongs to")

    def test_a_find_minute_past_the_sitting_is_refused_without_writing(self):
        folder = self.closed()
        before = self.read(folder)
        code, out = run(["--debrief", folder, "--reached-lesson-1", "yes", "--minutes-to-lesson-1", "45"])
        self.assertEqual(code, 1, "expected a find minute longer than the sitting to be refused")
        self.assertIn("longer than the", out, "expected the refusal to quote the pair that disagrees")
        self.assertEqual(self.read(folder), before, "expected a refused find to leave the record untouched")

    def test_saying_they_never_found_it_clears_a_stale_minute(self):
        folder = self.closed()
        run(["--debrief", folder, "--reached-lesson-1", "yes", "--minutes-to-lesson-1", "4"])
        code, _ = run(["--debrief", folder, "--reached-lesson-1", "no"])
        self.assertEqual(code, 0, "expected a corrected answer to be accepted on a second debrief")
        self.assertIsNone(
            self.read(folder)["minutes_to_lesson_1"],
            "expected a find that did not happen to leave no minute behind, which would read as a slow find",
        )

    def test_finished_minutes_alone_is_a_usage_error(self):
        folder = self.closed()
        code, out = run(["--debrief", folder, "--finished-minutes", "33"])
        self.assertEqual(code, 2, "expected a finish minute with no `--finished` answer to be a usage error")
        self.assertIn("--finished", out, "expected the refusal to say why the minute needs the answer")

    def test_a_full_debrief_makes_the_sitting_count(self):
        folder = self.closed()
        code, _ = run(
            ["--debrief", folder, "--understood", "yes", "--knew-next", "yes",
             "--their-fix", "nothing, it was clear", "--run-verify", "yes",
             "--finished", "yes", "--finished-minutes", "33"]
        )
        self.assertEqual(code, 0, "expected a complete debrief to be accepted")
        code, out = run(["--check", folder])
        self.assertEqual(code, 0, "expected the debriefed record to pass its own audit")
        self.assertIn("[PASS]", out, "expected the audit to print a pass for a fully answered sitting")
        code, out = run(["--status"])
        self.assertEqual(code, 0, "expected --status to pass once the record is closed and answered")
        self.assertIn("N (non-author) = 1", out, "expected the debriefed sitting to be counted as a participant")


TEMPLATE = os.path.join(ROOT, ".github", "ISSUE_TEMPLATE", "beginner-session-log.md")


class IssueTemplateTests(unittest.TestCase):
    """The observation ticket and the sitting record have to speak the same language.

    They drifted once already: the template offered `install` and `error message` where the record's
    vocabulary is `setup` and `error`, so a stop copied from a ticket would have been refused by
    `--check`, and the top-10 table would have grouped the two forms differently.
    """

    def setUp(self):
        with open(TEMPLATE, encoding="utf-8") as handle:
            self.text = handle.read()

    def test_the_stop_kinds_are_the_records_kinds(self):
        for kind in ps.STUCK_KINDS:
            self.assertIn(
                f"`{kind}`",
                self.text,
                f"expected the ticket to offer the record's kind {kind!r}, or a stop copied from it is refused",
            )
        for retired in ("`install`", "`error message`"):
            self.assertNotIn(
                retired,
                self.text,
                f"expected the retired kind {retired} to be gone, since the record never accepted it",
            )

    def test_every_stop_column_is_a_record_field(self):
        header = next(
            (line for line in self.text.splitlines() if line.strip().startswith("| Minute |")),
            "",
        )
        self.assertTrue(header, "expected the ticket to keep a stop table headed by the minute column")
        for column in ("Minute", "Page or lesson", "What they tried", "kind", "Resolved by"):
            self.assertIn(
                column,
                header,
                f"expected the stop table to keep the {column!r} column the record also stores",
            )

    def test_the_help_vocabulary_and_the_graded_loop_match(self):
        for help_kind in ps.HELP_KINDS:
            self.assertIn(
                help_kind,
                self.text,
                f"expected the ticket to offer the help type {help_kind!r} the record accepts",
            )
        for field in ("run_verify", "understood_error", "knew_next", "finished_minutes", "active_minutes"):
            self.assertIn(
                field,
                self.text,
                f"expected the ticket to name the record field {field!r}, so the row can be filed as written",
            )

    def test_the_ticket_says_it_is_not_a_pilot_row(self):
        self.assertIn(
            "not a pilot row",
            self.text,
            "expected the ticket to say a one-off observation is not a pilot row, which PILOT.md §6 requires",
        )
        self.assertIn(
            "pilot_sitting.py",
            self.text,
            "expected the ticket to name the record it mirrors, so a reader can find the real one",
        )


class IssueRenderTests(unittest.TestCase):
    """`--issue` turns a closed record into the ticket body, so the stops are typed once.

    The failure this class exists for is the one a hand-copied ticket has: the record says one thing and
    the filed issue says a slightly different one, or a public ticket quotes a stop nobody wrote. So the
    render is checked the way the record is — the same sections as the template, every stop as a row, an
    unrecorded answer said out loud rather than left blank, and a record its evidence does not support
    refused with **no body on stdout** to copy.
    """

    def setUp(self):
        self.data = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.data)
        self.saved = ps.DATA
        ps.DATA = self.data
        self.addCleanup(setattr, ps, "DATA", self.saved)

    def closed(self, **export_kwargs):
        folder = os.path.join(self.data, f"{DAY}-ab")
        os.makedirs(folder, exist_ok=True)
        self.assertEqual(
            run(["--new", folder, "--date", DAY])[0], 0, "expected --new to open the sitting record in its folder"
        )
        run(
            ["--stop", folder, "--minute", "6", "--kind", "link", "--page", "README",
             "--tried", "scrolled looking for Start", "--resolved", "author pointed at the heading"]
        )
        with open(os.path.join(folder, f"mechalab-learning-log-{DAY}.json"), "w", encoding="utf-8") as handle:
            json.dump(export_payload(**export_kwargs), handle)
        self.assertEqual(
            run(["--finish", folder, "--elapsed", "40"])[0], 0, "expected --finish to close the record from the export"
        )
        return folder

    def test_the_render_keeps_the_template_sections_in_order(self):
        folder = self.closed()
        code, body, _ = run_split(["--issue", folder])
        self.assertEqual(code, 0, "expected a clean record to render a ticket")
        with open(TEMPLATE, encoding="utf-8") as handle:
            template = handle.read()
        headings = lambda text: [line.strip() for line in text.splitlines() if line.startswith("### ")]
        self.assertEqual(
            headings(body),
            headings(template),
            "expected the rendered ticket to carry the template's sections in its order, or the two drifted",
        )
        self.assertIn("not a pilot row", body, "expected the body to keep the rule that it is not a pilot row")

    def test_every_stop_is_rendered_as_a_row_with_its_kind(self):
        folder = self.closed()
        code, body, _ = run_split(["--issue", folder])
        self.assertEqual(code, 0, "expected a clean record to render a ticket")
        self.assertIn(
            "| 6 | README | scrolled looking for Start | `link` | author pointed at the heading |",
            body,
            "expected the logged stop to be a row the top-10 table can group, not prose to retype",
        )

    def test_an_unanswered_field_is_said_out_loud_rather_than_left_blank(self):
        folder = os.path.join(self.data, f"{DAY}-cd")
        os.makedirs(folder, exist_ok=True)
        run(["--new", folder, "--date", DAY])
        code, body, _ = run_split(["--issue", folder])
        self.assertEqual(code, 0, "expected an open record to render, since it claims nothing")
        self.assertIn(
            "`background.has_coded` | not answered |",
            body,
            "expected an unanswered background question to read as unanswered, not as `no`",
        )
        self.assertIn(
            "| Device and browser | `device` | — |", body, "expected a field the record never captured to be a dash"
        )
        self.assertIn("No stop was logged", body, "expected a sitting with no stops to say so in the body")

    def test_a_record_its_evidence_does_not_support_is_refused_without_a_body(self):
        folder = self.closed(verified=False)
        with open(os.path.join(folder, "sitting.json"), encoding="utf-8") as handle:
            record = json.load(handle)
        record.update({"finished": True, "run_verify": True, "finished_minutes": 30})
        with open(os.path.join(folder, "sitting.json"), "w", encoding="utf-8") as handle:
            json.dump(record, handle)
        code, body, err = run_split(["--issue", folder])
        self.assertEqual(code, 1, "expected a claim the export cannot back to stop the ticket being rendered")
        self.assertEqual(body.strip(), "", "expected no body on stdout, so nothing unsupported can be copied")
        self.assertIn("verifies nothing", err, "expected the refusal to say which claim has no evidence")

    def test_a_folder_with_no_record_is_a_usage_error(self):
        folder = os.path.join(self.data, f"{DAY}-ef")
        os.makedirs(folder, exist_ok=True)
        code, body, err = run_split(["--issue", folder])
        self.assertEqual(code, 2, "expected --issue in a folder with no record to be a usage error")
        self.assertEqual(body.strip(), "", "expected a usage error to print nothing to stdout")
        self.assertIn("--new", err, "expected the error to say which command opens the record")

    def test_out_into_a_folder_that_is_not_there_is_refused_before_the_body(self):
        folder = self.closed()
        code, body, err = run_split(["--issue", folder, "--out", os.path.join(self.data, "nope", "body.md")])
        self.assertEqual(code, 2, "expected a missing output folder to be a usage error, not a traceback")
        self.assertEqual(body.strip(), "", "expected the refusal to withhold the body as well as the write")
        self.assertIn("is not a folder to write", err, "expected the refusal to name the folder it cannot write to")

    def test_out_writes_the_same_body_and_leaves_no_temporary(self):
        folder = self.closed()
        target = os.path.join(self.data, "body.md")
        code, body, err = run_split(["--issue", folder, "--out", target])
        self.assertEqual(code, 0, "expected --out to render and write in one command")
        with open(target, encoding="utf-8") as handle:
            self.assertEqual(handle.read(), body, "expected the file and stdout to be the same body")
        self.assertFalse(os.path.exists(f"{target}.tmp"), "expected the atomic write to clean up its temp file")
        self.assertIn(
            "suggested title: [Beginner Sitting] 2026-10-24",
            err,
            "expected a title beside the body, since the template's title line needs the day and background",
        )


if __name__ == "__main__":
    unittest.main()
