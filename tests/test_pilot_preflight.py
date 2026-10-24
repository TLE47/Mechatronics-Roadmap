#!/usr/bin/env python3
"""Tests for `scripts/pilot_preflight.py` — the check that runs before a participant leaves.

The failures that matter are the ones that would put a wrong number in the pilot's sheet:

1. **An export from the wrong build** — a schema the log module does not declare, accepted and
   averaged into a beginner's row.
2. **A visit counted twice** — two `lesson_open` events a few milliseconds apart (the defect Run 216
   fixed), which inflates the denominator every other pilot share is taken of.
3. **A time column with no measurement** — an export whose `sittings` array is missing or empty,
   logged as if the clock had answered.
4. **The two instruments disagreeing** — a sitting that counts a different number of runs from the
   log, so neither number can be copied into the sheet unexamined.
5. **A broken report** — `--json` that is not parseable, or a clean export that exits non-zero.

Run: `python3 tests/test_pilot_preflight.py` (also wired into the CI verify step).
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "pilot_preflight.py")

spec = importlib.util.spec_from_file_location("pilot_preflight", SCRIPT)
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)

MINUTE = 60_000
T0 = 1_759_000_000_000


def event(t, kind, lesson=None, **extra):
    payload = {"t": t, "kind": kind}
    if lesson:
        payload["lesson"] = lesson
    payload.update(extra)
    return payload


def export(events, sittings=None, schema="mechalab.learning-log/1"):
    payload = {"schema": schema, "exportedAt": T0 + 10 * MINUTE, "events": events}
    if sittings is not None:
        payload["sittings"] = sittings
    return payload


def sitting(start, end, runs, lessons=("P.1",)):
    return {"start": start, "end": end, "runs": runs, "reviews": 0, "lessons": list(lessons)}


def run(argv):
    """`main`, with its report captured: the assertions are about the code and the text."""
    with tempfile.TemporaryFile("w+", encoding="utf-8") as out:
        stdout, stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, out
        try:
            code = pp.main(argv)
        finally:
            sys.stdout, sys.stderr = stdout, stderr
        out.seek(0)
        return code, out.read()


def severities(result):
    return [severity for severity, _ in result["findings"]]


class PilotPreflightTests(unittest.TestCase):
    def write(self, payload):
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(payload, handle)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def clean(self):
        """One visit, two runs, a pass, in a 3 min 52 s sitting — the shape Run 214 measured."""
        start = T0
        events = [
            event(start, "lesson_open", "P.1"),
            event(start + 20_000, "run", "P.1", outcome="behavior_failed"),
            event(start + 40_000, "run", "P.1", outcome="passed"),
            event(start + 45_000, "verified", "P.1"),
        ]
        return export(events, [sitting(start, start + 232_300, 2)])

    # ---- What a clean export gives the observer ----

    def test_a_clean_export_passes_and_prints_the_sheet_numbers(self):
        result = pp.examine(self.write(self.clean()))
        self.assertEqual(result["findings"], [], "expected no findings at all on a clean export")
        code, text = run([self.write(self.clean())])
        self.assertEqual(code, 0, "expected exit 0; check that a clean export is not reported as a finding")
        self.assertIn(
            "[PASS] 1 export(s) ready to log", text, "expected the summary to say the export is ready to log"
        )
        self.assertEqual(
            result["sheet"]["active_minutes"], 4, "expected 232 s to round to 4 active minutes on the sheet"
        )
        self.assertEqual(result["sheet"]["runs"], 2, "expected the two run events to be counted as two runs")
        self.assertEqual(result["sheet"]["help"], "none", "expected no help; neither hint nor solution was used")
        self.assertIs(result["sheet"]["verified"], True, "expected verified yes; a pass event is in the export")
        self.assertEqual(
            result["sheet"]["lessons"], ["P.1"], "expected the lesson list to name P.1, the visited lesson"
        )

    def test_the_sheet_line_names_what_the_row_needs(self):
        text = "\n".join(pp.report(pp.examine(self.write(self.clean()))))
        self.assertIn("active_minutes 4", text, "expected the sheet line to carry the active minutes")
        self.assertIn("help none", text, "expected the sheet line to say no help was used")
        self.assertIn("verified yes", text, "expected the sheet line to say the lesson was verified")
        self.assertIn("sitting 1 3 min 52 s", text, "expected the sitting duration a person reads, not raw ms")

    # ---- The defect classes ----

    def test_a_visit_logged_twice_is_named_with_its_gap(self):
        payload = self.clean()
        opened = payload["events"][0]
        payload["events"].insert(1, dict(opened, t=opened["t"] + 7))
        result = pp.examine(self.write(payload))
        self.assertEqual(
            severities(result), ["WARN"], "expected one WARN: a doubled visit is loggable, and worth noting"
        )
        self.assertIn("7 ms apart", result["findings"][0][1], "expected the gap in ms to be named, not just doubled")
        code, text = run([self.write(payload)])
        self.assertEqual(code, 1, "expected exit 1; check that a doubled visit is reported as a finding")
        self.assertIn(
            "[WARN] 1 finding(s): 0 FAIL, 1 WARN",
            text,
            "expected a warn-only run to be tagged WARN, not FAIL, in the summary line",
        )

    def test_two_opens_a_real_break_apart_are_two_visits(self):
        payload = self.clean()
        payload["events"].append(event(T0 + 6 * MINUTE, "lesson_open", "P.1"))
        result = pp.examine(self.write(payload))
        self.assertEqual(result["findings"], [], "expected a return after a break to be a visit, not a replay")

    def test_a_missing_sittings_array_fails_the_time_column(self):
        payload = self.clean()
        del payload["sittings"]
        result = pp.examine(self.write(payload))
        self.assertIn("FAIL", severities(result), "expected FAIL; without sittings the time column is a guess")
        self.assertIn(
            "`sittings` array",
            " ".join(message for _, message in result["findings"]),
            "expected the finding to name the missing array the operator has to re-export",
        )

    def test_an_empty_sittings_array_fails_too(self):
        payload = self.clean()
        payload["sittings"] = []
        result = pp.examine(self.write(payload))
        self.assertIn("FAIL", severities(result), "expected FAIL; an empty clock has no measured duration")

    def test_a_foreign_schema_is_refused_by_name(self):
        payload = self.clean()
        payload["schema"] = "mechalab.learning-log/2"
        result = pp.examine(self.write(payload))
        self.assertIn(
            "learning-log/2",
            " ".join(message for _, message in result["findings"]),
            "expected the finding to quote the schema it found, so the operator can name the build",
        )

    def test_a_sitting_and_the_log_disagreeing_is_reported(self):
        payload = self.clean()
        payload["sittings"] = [sitting(T0, T0 + 232_300, 3)]
        result = pp.examine(self.write(payload))
        self.assertIn(
            "counts 3 run(s), the log has 2",
            " ".join(message for _, message in result["findings"]),
            "expected the disagreement to name both numbers, since one instrument missed a write",
        )

    def test_an_export_where_nothing_ran_still_logs_with_a_warning(self):
        payload = export([event(T0, "lesson_open", "P.1")], [sitting(T0, T0 + MINUTE, 0)])
        result = pp.examine(self.write(payload))
        self.assertEqual(
            severities(result), ["WARN"], "expected a WARN only: a learner who reads and leaves is data"
        )
        self.assertEqual(result["sheet"]["runs"], 0, "expected zero runs to be reported as zero, not as missing")

    def test_an_unknown_event_kind_is_named_rather_than_ignored(self):
        payload = self.clean()
        payload["events"].append(event(T0 + 50_000, "teleport", "P.1"))
        result = pp.examine(self.write(payload))
        self.assertIn(
            "teleport",
            " ".join(message for _, message in result["findings"]),
            "expected an unknown event kind to be named, so a newer build is noticed rather than averaged",
        )

    # ---- The command line ----

    def test_json_is_parseable_and_carries_the_sheet(self):
        code, text = run(["--json", self.write(self.clean())])
        payload = json.loads(text)
        self.assertEqual(code, 0, "expected exit 0 in JSON mode for a clean export")
        self.assertEqual(payload["findings"], 0, "expected the JSON report to count zero findings")
        self.assertEqual(
            payload["exports"][0]["sheet"]["active_minutes"], 4, "expected the sheet numbers inside the JSON"
        )

    def test_a_file_that_is_not_there_is_a_usage_error(self):
        code, text = run([os.path.join(ROOT, "pilot-data", "nope.json")])
        self.assertEqual(code, 2, "expected exit 2 for a path that is not there, not a findings exit")
        self.assertIn("is not there", text, "expected the message to say the file is missing, not that it is empty")

    def test_broken_json_cannot_be_logged(self):
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        handle.write("{not json")
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        result = pp.examine(handle.name)
        self.assertEqual(
            severities(result), ["FAIL"], "expected FAIL for unparseable JSON; nothing in it can be logged"
        )
        self.assertIsNone(result["sheet"], "expected no sheet line, since no number in the file is readable")


if __name__ == "__main__":
    unittest.main(verbosity=2)
