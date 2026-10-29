"""The weekly data commit must carry the surface snapshot it moves — and nothing else.

`a79e857` appended a history row, regenerated `app/src/data/linkHistoryData.ts` and committed both,
which is the contract `tests/test_link_history_data.py` pins. What it also did, silently, was make the
Links tab 87 px taller: that tab draws its host and run tables from the module, so the committed
`docs/surface-snapshot.json` no longer described the page, and `main` went red on a commit nobody had
made by hand.

`scripts/record_links_surface.py` closes that loop, and its decision is the part worth pinning: a data
refresh may move **boxes** on **that one surface**, and nothing else. A count moving, a resolved style
moving, or another surface moving is a code change, and recording it in the weekly job would hide it.
The record path is checked against a fake sweep — this file must never write the real snapshot, whose
numbers belong to the Linux runner.
"""

import argparse
import importlib.util
import json
import os
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "record_links_surface.py"

spec = importlib.util.spec_from_file_location("record_links_surface", SCRIPT)
rec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rec)


def rows(*surfaces, part="boxes", field="main"):
    return [
        {
            "surface": surface,
            "part": part,
            "field": field,
            "expected": [196, 152, 1244, 2269],
            "actual": [196, 152, 1244, 2356],
        }
        for surface in surfaces
    ]


class RefusalTests(unittest.TestCase):
    """What the weekly job may record: geometry on the Links tab, and nothing else."""

    def test_geometry_on_the_links_tab_is_recordable(self):
        self.assertEqual(rec.offenders(rows("dark/tab-links", "paper/tab-links"), []), [])

    def test_another_surface_is_never_recorded(self):
        bad = rec.offenders(rows("dark/tab-arch"), [])
        self.assertEqual(len(bad), 1, msg="a code change on another tab must not be papered over")
        self.assertEqual(bad[0]["surface"], "dark/tab-arch")

    def test_a_count_on_the_links_tab_is_never_recorded(self):
        bad = rec.offenders(rows("dark/tab-links", part="counts", field="links"), [])
        self.assertEqual(len(bad), 1, msg="a count moving means the surface's shape changed, not its height")

    def test_a_resolved_style_on_the_links_tab_is_never_recorded(self):
        bad = rec.offenders(rows("dark/tab-links", part="styles", field="panel.fontSize"), [])
        self.assertEqual(len(bad), 1, msg="a style moving is a code change")

    def test_a_stale_surface_is_never_recorded(self):
        bad = rec.offenders([], ["dark/tab-retired"])
        self.assertEqual(len(bad), 1, msg="a surface the sweep did not produce is a tab that moved, not data")


class WorkflowTests(unittest.TestCase):
    """Where the re-record runs, and why it cannot run anywhere else.

    `docs/surface-snapshot.json` is a record of one job's measurement. The workflow that writes the data
    measured `tab-links` 47 px lower than `ci.yml`'s audits job did — same runner, same commit — so a
    re-record written there would be numbers the check then rejects. The step therefore lives in the
    audits job, on a push to `main` (or a dispatched run, which is how it is exercised off `main`), and
    before the check it would otherwise fail on.
    """

    WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
    STEP_PREFIX = "      - name: "

    def workflow_text(self) -> str:
        self.assertTrue(self.WORKFLOW.exists(), f"expected {self.WORKFLOW}")
        return self.WORKFLOW.read_text(encoding="utf-8")

    def step_body(self) -> str:
        lines = self.workflow_text().splitlines()
        start = next(
            (i for i, line in enumerate(lines) if line.startswith(self.STEP_PREFIX) and "re-record the links tab" in line.lower()),
            None,
        )
        self.assertIsNotNone(start, "expected a step that re-records the Links tab")
        end = next(
            (i for i, line in enumerate(lines[start + 1 :], start + 1) if line.startswith(self.STEP_PREFIX)),
            len(lines),
        )
        return "\n".join(lines[start:end])

    def test_the_step_runs_where_the_baseline_is_measured(self):
        text = self.workflow_text()
        step = self.step_body()
        self.assertIn("refs/heads/main", step, msg="expected the step to be main-only")
        self.assertIn("re-record-links-surface", step, msg="expected a dispatched run to be able to exercise it")
        self.assertLess(
            text.index("re-record the Links tab"),
            text.index("Check the surface snapshot"),
            msg="expected the re-record before the check that would fail on it",
        )

    def test_the_step_stages_only_the_snapshot(self):
        step = self.step_body()
        add = next((line for line in step.splitlines() if "git add" in line), "")
        self.assertIn("docs/surface-snapshot.json", add)
        self.assertEqual(step.count("git commit"), 1, msg="expected one commit for the one file")
        self.assertLess(
            step.find("python3 scripts/record_links_surface.py"),
            step.find("git add"),
            msg="expected the measurement before staging, or the commit carries the old numbers",
        )

    def test_the_job_may_push_the_commit_it_makes(self):
        text = self.workflow_text()
        job = text[text.index("  audit-suites:") : text.index("Check the settle gate")]
        self.assertIn("contents: write", job, msg="a job that pushes needs contents: write")


class ParseTests(unittest.TestCase):
    def test_the_sweeps_json_parses_when_it_is_the_whole_stream(self):
        body = {"drift": [], "stale": []}
        self.assertEqual(rec.parse_body(json.dumps(body)), body)

    def test_it_parses_when_a_rebuild_wrote_first(self):
        # `ensureBuilt` runs `npm run build` through the sweep's stdout, so the JSON is the tail.
        stream = "vite v6 building for production...\n(!) some chunks are larger than 500 kB\n" + json.dumps(
            {"drift": rows("dark/tab-links"), "stale": []}, indent=2
        )
        body = rec.parse_body(stream)
        self.assertIsNotNone(body, msg="expected the tail of a rebuilt run's stdout to parse")
        self.assertEqual(len(body["drift"]), 1)

    def test_garbage_is_not_parsed_as_an_empty_surface(self):
        self.assertIsNone(rec.parse_body("no json here\n"))
        self.assertIsNone(rec.parse_body(""))


class FlowTests(unittest.TestCase):
    """The three outcomes the workflow relies on, against a fake sweep."""

    def run_script(self, *args, ambient_ci="true", sweeps=None, record_status=0):
        namespace = argparse.Namespace(dry_run=False, check=False, json=False, allow_local=False, no_input=False)
        for flag in args:
            setattr(namespace, flag.lstrip("-").replace("-", "_"), True)
        responses = list(sweeps or [{"drift": [], "stale": []}])

        def fake_sweep(*_args):
            body = responses.pop(0)
            return 0 if not body.get("drift") else 1, body, ""

        env = {"CI": ambient_ci} if ambient_ci is not None else {}
        with mock.patch.object(rec, "sweep", side_effect=fake_sweep), mock.patch.object(
            rec.subprocess, "run", return_value=mock.Mock(returncode=record_status, stderr="", stdout="")
        ) as record, mock.patch.dict(os.environ, env, clear=True):
            status = rec.entry(namespace)
        return status, record

    def test_nothing_moved_means_the_data_commits_alone(self):
        status, record = self.run_script()
        self.assertEqual(status, 0)
        record.assert_not_called()

    def test_boxes_on_the_links_tab_are_recorded_and_confirmed(self):
        status, record = self.run_script(
            sweeps=[{"drift": rows("dark/tab-links"), "stale": []}, {"drift": [], "stale": []}]
        )
        self.assertEqual(status, 0)
        self.assertEqual(record.call_count, 1, msg="expected one re-record and one confirmation sweep")
        argv = record.call_args.args[0]
        self.assertIn("--record", argv, msg="expected the re-record to go through the sweep's own flag")
        self.assertEqual(argv[-2:], ["--tab", "tab-links"], msg="expected all four palettes of one surface")

    def test_a_count_on_the_links_tab_fails_without_recording(self):
        status, record = self.run_script(sweeps=[{"drift": rows("dark/tab-links", part="counts"), "stale": []}])
        self.assertEqual(status, 1)
        record.assert_not_called()

    def test_a_record_that_leaves_drift_still_fails(self):
        status, _ = self.run_script(
            sweeps=[{"drift": rows("dark/tab-links"), "stale": []}, {"drift": rows("dark/tab-links"), "stale": []}]
        )
        self.assertEqual(status, 1, msg="the confirmation sweep must decide, not the record's exit code")

    def test_recording_off_the_runner_is_refused(self):
        status, record = self.run_script(ambient_ci=None, sweeps=[{"drift": rows("dark/tab-links"), "stale": []}])
        self.assertEqual(status, 2, msg="a macOS record writes the header wrap's 47 px into a Linux file")
        record.assert_not_called()

    def test_dry_run_says_what_it_would_write(self):
        status, record = self.run_script("--dry-run", sweeps=[{"drift": rows("dark/tab-links"), "stale": []}])
        self.assertEqual(status, 0)
        record.assert_not_called()

    def test_check_fails_when_a_re_record_is_due(self):
        status, record = self.run_script("--check", sweeps=[{"drift": rows("dark/tab-links"), "stale": []}])
        self.assertEqual(status, 1)
        record.assert_not_called()


if __name__ == "__main__":
    unittest.main()
