"""The Link Health dashboard is only as honest as the data it plots, so these tests pin the join.

`scripts/check_links.py --history` appends one JSON line per run; `scripts/generate_link_history_data.py`
turns that append-only file into the typed module the dashboard imports. Nothing else writes the
module. These tests cover the three claims that arrangement makes: the committed module is in sync
with the committed history, a corrupt line is reported instead of plotted as zero, and the generated
TS keeps every field the chart reads.
"""

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts" / "generate_link_history_data.py"
COMMITTED = ROOT / "app" / "src" / "data" / "linkHistoryData.ts"
HISTORY = ROOT / "docs" / "link-check-history.jsonl"


def run_generator(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(GENERATOR), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


spec = importlib.util.spec_from_file_location("generate_link_history_data", GENERATOR)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


def record(date: str, **overrides) -> dict:
    row = {
        "date": date,
        "urls": 500,
        "served": 470,
        "not_checked": 30,
        "failed": 2,
        "verdicts": {"PASS": 468, "FAIL": 2, "BLOCKED": 20, "UNREACHABLE": 10},
    }
    row.update(overrides)
    return row


class HostRecurrenceTests(unittest.TestCase):
    def rows(self, *url_lists, dates=None):
        dates = dates or [f"2026-10-0{i + 1}T00:00:00+00:00" for i in range(len(url_lists))]
        return [{"date": date, "unverified": urls} for date, urls in zip(dates, url_lists)]

    def test_a_host_counts_once_per_run_not_once_per_url(self):
        rows = self.rows(
            ["https://www.a.example/x", "https://a.example/y"],
            ["https://a.example/y"],
        )
        recurrence, runs = gen.host_recurrence(rows)
        a = next(entry for entry in recurrence if entry["host"] == "a.example")
        self.assertEqual(
            (a["runs"], runs), (2, 2),
            "expected www.a.example and a.example to be one host counted once per run; counting "
            "URLs instead would make a host with ten blocked PDFs look ten times flakier",
        )

    def test_the_current_count_comes_from_the_latest_run_only(self):
        rows = self.rows(
            ["https://a.example/x", "https://a.example/y"],
            ["https://a.example/y"],
        )
        recurrence, _runs = gen.host_recurrence(rows)
        self.assertEqual(
            recurrence[0]["urls"], 1,
            "expected `urls` to be what the latest run lists, not everything ever seen; the table "
            "labels it 'URLs now'",
        )

    def test_a_row_without_a_url_list_is_not_a_run_for_recurrence(self):
        rows = self.rows(
            ["https://a.example/x"],
            None,
            ["https://a.example/x"],
        )
        recurrence, runs = gen.host_recurrence(rows)
        self.assertEqual(
            (runs, recurrence[0]["runs"]), (2, 2),
            "expected a pre-`unverified` row to be excluded from both counts; treating it as an "
            "empty run would understate the denominator and overstate recurrence",
        )

    def test_the_worst_host_comes_first(self):
        rows = self.rows(
            ["https://once.example/x", "https://always.example/x"],
            ["https://always.example/x"],
        )
        recurrence, _runs = gen.host_recurrence(rows)
        self.assertEqual(
            [entry["host"] for entry in recurrence],
            ["always.example", "once.example"],
            "expected the table order to be worst-first (runs, then current URLs, then host), so "
            "the recurring wall is the first row a maintainer reads",
        )

    def test_last_seen_is_the_latest_run_that_listed_the_host(self):
        rows = self.rows(
            ["https://a.example/x"],
            ["https://b.example/x"],
        )
        recurrence, _runs = gen.host_recurrence(rows)
        a = next(entry for entry in recurrence if entry["host"] == "a.example")
        self.assertEqual(
            a["lastSeen"], "2026-10-01T00:00:00+00:00",
            "expected last-seen to stay at the run that listed the host, not move to the newest run",
        )


class LinkHistoryGeneratorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.history = pathlib.Path(self.tmp.name) / "history.jsonl"
        self.out = pathlib.Path(self.tmp.name) / "linkHistoryData.ts"

    def write_history(self, *rows, raw_lines=()):
        lines = [json.dumps(r) for r in rows] + list(raw_lines)
        self.history.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def generate(self, *extra: str) -> subprocess.CompletedProcess:
        return run_generator("--history", str(self.history), "--out", str(self.out), *extra)

    def test_committed_module_matches_the_committed_history(self):
        result = run_generator("--check")
        self.assertEqual(
            result.returncode,
            0,
            f"expected --check to pass on the committed history; got exit {result.returncode}: {result.stderr}",
        )
        self.assertIn(
            "is in sync", result.stdout, "expected --check to report the module is in sync with the history"
        )

    def test_writes_the_fields_the_dashboard_reads(self):
        self.write_history(record("2026-10-01T03:00:00+00:00"))
        result = self.generate()
        self.assertEqual(
            result.returncode, 0, f"expected generation to exit 0, got {result.returncode}: {result.stderr}"
        )
        text = self.out.read_text(encoding="utf-8")

        self.assertTrue(
            text.startswith("// Auto-generated by scripts/generate_link_history_data.py"),
            "expected the module to open with the generated-by header; a hand edit would lose it",
        )
        for field in (
            '"date": "2026-10-01T03:00:00+00:00"',
            '"urls": 500',
            '"served": 470',
            '"notChecked": 30',
            '"failed": 2',
            '"blocked": 20',
            '"unreachable": 10',
            '"serverError": 0',
        ):
            self.assertIn(field, text, f"expected the generated module to carry {field!r}; the dashboard reads it")

        # --check is a real byte comparison, and a hand edit to the module is drift.
        self.assertEqual(
            self.generate("--check").returncode,
            0,
            "expected --check to pass on a freshly written module; a stale write would drift at once",
        )
        self.out.write_text(text.replace('"notChecked": 30', '"notChecked": 0'), encoding="utf-8")
        drift = self.generate("--check")
        self.assertEqual(drift.returncode, 1, "expected --check to fail after a hand edit; drift must be caught")
        self.assertIn("out of sync", drift.stderr, "expected the drift error to name the out-of-sync module")

    def test_rows_are_sorted_by_time_not_file_order(self):
        self.write_history(
            record("2026-10-03T03:00:00+00:00", not_checked=9),
            record("2026-10-01T03:00:00+00:00", not_checked=1),
            record("2026-10-02T03:00:00+00:00", not_checked=5),
        )
        self.assertEqual(
            self.generate().returncode, 0, "expected generation to succeed for an out-of-order history file"
        )
        text = self.out.read_text(encoding="utf-8")
        order = [text.index(f'"notChecked": {n},') for n in (1, 5, 9)]
        self.assertEqual(
            order, sorted(order), "expected chronological points; an unsorted chart x-axis would lie about time"
        )

    def test_corrupt_lines_are_reported_and_not_plotted_as_zero(self):
        self.write_history(
            record("2026-10-01T03:00:00+00:00"),
            raw_lines=(
                "{not json",
                json.dumps({"urls": 10}),  # no date
                json.dumps(record("2026-10-02T03:00:00+00:00", not_checked=-4)),
            ),
        )
        result = self.generate()
        self.assertEqual(
            result.returncode,
            0,
            f"expected generation to skip bad lines and still exit 0, got {result.returncode}: {result.stderr}",
        )
        self.assertEqual(
            result.stderr.count("WARN: skipped"),
            3,
            "expected one warning per unplottable line: bad JSON, missing date, negative count",
        )

        text = self.out.read_text(encoding="utf-8")
        self.assertEqual(
            text.count('"date":'),
            1,
            "expected exactly one run in LINK_HISTORY; a corrupt line must be skipped, never plotted as zero",
        )
        self.assertIn(
            '"notChecked": 30', text, "expected the valid run's not-checked count to survive in the module"
        )

        skipped = text.split("export const LINK_HISTORY_SKIPPED: string[] = ", 1)[1]
        self.assertIn("invalid JSON", skipped, "expected the skipped list to name the invalid JSON line")
        self.assertIn("missing `date`", skipped, "expected the skipped list to name the row with no date")
        self.assertIn("non-negative", skipped, "expected the skipped list to name the negative count")

    def test_missing_history_file_fails_instead_of_rendering_an_empty_chart(self):
        result = self.generate()
        self.assertEqual(
            result.returncode, 1, "expected a missing history file to fail rather than render an empty chart"
        )
        self.assertIn("does not exist", result.stderr, "expected the failure to say the history file is missing")

    def test_json_summary_reports_runs_and_latest(self):
        self.write_history(
            record("2026-10-01T03:00:00+00:00"),
            record("2026-10-09T03:00:00+00:00"),
        )
        result = self.generate("--json")
        self.assertEqual(
            result.returncode, 0, f"expected the JSON summary run to exit 0, got {result.returncode}: {result.stderr}"
        )
        summary = json.loads(result.stdout)
        self.assertEqual(summary["runs"], 2, "expected the summary to count both runs in the history")
        self.assertEqual(
            summary["latest"],
            "2026-10-09T03:00:00+00:00",
            "expected the summary to name the newest run by timestamp, not the last line in the file",
        )
        self.assertEqual(summary["skipped"], 0, "expected no skipped lines when every row is valid")


class SweepWorkflowTests(unittest.TestCase):
    """The commit that records a history row must carry the module generated from it.

    `ci.yml` runs the generator with `--check`, so the two files disagreeing is a red build. The weekly
    sweep is the only writer of the row, so it is the only place that can commit them apart: a step
    that staged `docs/link-check-history.jsonl` alone turned `main` red (`be434a0`) and every PR with
    it. These assertions are that step's contract, not its wording: generate, then stage both, then
    one commit.
    """

    WORKFLOW = ROOT / ".github" / "workflows" / "link-check.yml"
    STEP_PREFIX = "      - name: "

    def record_step(self) -> str:
        self.assertTrue(
            self.WORKFLOW.exists(),
            f"expected the sweep's workflow at {self.WORKFLOW}; a moved file would silently stop checking it",
        )
        lines = self.WORKFLOW.read_text(encoding="utf-8").splitlines()
        start = next(
            (i for i, line in enumerate(lines) if line.startswith(self.STEP_PREFIX) and "Record the sweep" in line),
            None,
        )
        self.assertIsNotNone(start, "expected a step that records the sweep's counts")
        end = next(
            (i for i, line in enumerate(lines[start + 1 :], start + 1) if line.startswith(self.STEP_PREFIX)),
            len(lines),
        )
        return "\n".join(lines[start:end])

    def test_the_row_and_the_module_land_in_one_commit(self):
        step = self.record_step()
        self.assertEqual(
            step.count("git commit"),
            1,
            "expected one commit for the pair; two commits leave main red in between",
        )
        add = next((line for line in step.splitlines() if "git add" in line), "")
        for path in ("docs/link-check-history.jsonl", "app/src/data/linkHistoryData.ts"):
            self.assertIn(path, add, f"expected the record step to stage {path} in the same commit")

    def test_the_module_is_generated_before_the_diff_is_read(self):
        step = self.record_step()
        generate = step.find("python3 scripts/generate_link_history_data.py")
        self.assertGreaterEqual(generate, 0, "expected the record step to run the generator")
        self.assertLess(
            generate,
            step.find("git diff --quiet"),
            "expected generation before the empty-diff check, or a stale module skips the commit",
        )
        self.assertNotIn(
            "generate_link_history_data.py --check",
            step,
            "expected the step to write the module; --check compares and writes nothing",
        )


class CommittedHistoryTests(unittest.TestCase):
    def test_every_committed_line_is_plottable(self):
        if not HISTORY.exists():
            self.skipTest("no history file yet")
        rows = [json.loads(line) for line in HISTORY.read_text(encoding="utf-8").splitlines() if line.strip()]
        for index, row in enumerate(rows):
            with self.subTest(line=index + 1):
                self.assertIn("date", row, "expected every committed row to carry a date the chart can place")
                self.assertGreaterEqual(row["urls"], 1, "expected a committed run to scan at least one URL")
                self.assertLessEqual(
                    row["served"], row["urls"], "expected served URLs not to exceed the scan total"
                )
                self.assertLessEqual(
                    row["not_checked"], row["urls"], "expected not-checked URLs not to exceed the scan total"
                )
                self.assertEqual(
                    row["failed"],
                    row.get("verdicts", {}).get("FAIL", 0),
                    "expected the failed count to equal the FAIL verdict count in the same row",
                )


if __name__ == "__main__":
    unittest.main()
