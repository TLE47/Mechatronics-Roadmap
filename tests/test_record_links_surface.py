"""The weekly data commit must carry the surface snapshot it moves — in the same commit.

`a79e857` appended a history row, regenerated `app/src/data/linkHistoryData.ts` and committed both,
which is the contract `tests/test_link_history_data.py` pins. What it also did, silently, was make the
Links tab 87 px taller: that tab draws its host and run tables from the module, so `docs/surface-snapshot.json`
no longer described the page, and `main` went red on a commit nobody had made by hand. The push that
commit was made with could not have caught it either: it used `GITHUB_TOKEN`, and an event that token
triggers does not start another workflow run, so `ci.yml` never graded it.

`scripts/record_links_surface.py` closes that loop inside the same job: measure the one surface, record
it only if nothing but geometry on it moved, and let the one commit carry all three files. Its decision is
the part worth pinning — a data refresh may move **boxes** on **that one surface**, and nothing else. A
count moving, a resolved style moving, or another surface moving is a code change, and recording it in
the weekly job would hide it.

The second thing this file pins is the reason the first version of that step wrote numbers the gate
rejected. It recorded from `ci.yml`'s audits job instead and read `tab-links` at 199 where the gate read
152; the guess was a job's chrome, then the platform, and both were wrong. `getBoundingClientRect` is
viewport-relative and the sweep had clicked eleven tabs, leaving the window 47 px down. The sweep now
starts every read from the top of the page, and the last class here is that contract.

The record path is checked against a fake sweep — this file must never write the real snapshot, whose
numbers belong to the runner and to a job that has a data row to justify them.
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
SWEEP = ROOT / "scripts" / "snapshot_surfaces.mjs"

spec = importlib.util.spec_from_file_location("record_links_surface", SCRIPT)
rec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rec)


def rows(*surfaces, part="boxes", field="main"):
    return [
        {
            "surface": surface,
            "part": part,
            "field": field,
            "expected": [196, 199, 1244, 2269],
            "actual": [196, 199, 1244, 2356],
        }
        for surface in surfaces
    ]


class RefusalTests(unittest.TestCase):
    """What the weekly job may record: geometry on the Links tab, and nothing else."""

    def test_geometry_on_the_links_tab_is_recordable(self):
        self.assertEqual(
            rec.offenders(rows("dark/tab-links", "paper/tab-links"), []),
            [],
            msg="expected geometry on the data-driven tab to be the one recordable difference",
        )

    def test_another_surface_is_never_recorded(self):
        bad = rec.offenders(rows("dark/tab-arch"), [])
        self.assertEqual(
            len(bad), 1, msg="expected a code change on another tab to be refused, not papered over"
        )
        self.assertEqual(
            bad[0]["surface"], "dark/tab-arch", msg="expected the refusal to name the surface it refused"
        )

    def test_a_count_on_the_links_tab_is_never_recorded(self):
        bad = rec.offenders(rows("dark/tab-links", part="counts", field="links"), [])
        self.assertEqual(
            len(bad),
            1,
            msg="expected a count moving to be refused: that is the tab's shape, not its height",
        )

    def test_a_resolved_style_on_the_links_tab_is_never_recorded(self):
        bad = rec.offenders(rows("dark/tab-links", part="styles", field="panel.fontSize"), [])
        self.assertEqual(
            len(bad), 1, msg="expected a resolved style moving to be refused as a code change"
        )

    def test_a_stale_surface_is_never_recorded(self):
        bad = rec.offenders([], ["dark/tab-retired"])
        self.assertEqual(
            len(bad),
            1,
            msg="expected a surface the sweep did not produce to be refused: a tab moved, not data",
        )


class WorkflowTests(unittest.TestCase):
    """The record lives in the weekly job, before the staging, in the same commit as the data.

    It cannot live in `ci.yml` on the push that follows: the weekly job pushes with `GITHUB_TOKEN`, and
    a push made with that token does not start another workflow run. Dispatching one instead would put a
    red `main` between the two commits for no reason.
    """

    WORKFLOW = ROOT / ".github" / "workflows" / "link-check.yml"
    CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
    STEP_PREFIX = "      - name: "

    def record_step(self) -> str:
        self.assertTrue(
            self.WORKFLOW.exists(), f"expected the weekly sweep at {self.WORKFLOW}; a moved file hides this"
        )
        lines = self.WORKFLOW.read_text(encoding="utf-8").splitlines()
        start = next(
            (i for i, line in enumerate(lines) if line.startswith(self.STEP_PREFIX) and "Record the sweep" in line),
            None,
        )
        self.assertIsNotNone(start, "expected a step that records the sweep's counts, and it is missing")
        end = next(
            (i for i, line in enumerate(lines[start + 1 :], start + 1) if line.startswith(self.STEP_PREFIX)),
            len(lines),
        )
        return "\n".join(lines[start:end])

    def test_the_pair_and_the_snapshot_land_in_one_commit(self):
        step = self.record_step()
        add = next((line for line in step.splitlines() if "git add" in line), "")
        self.assertTrue(add, msg="expected the record step to stage the files it committed")
        for path in (
            "docs/link-check-history.jsonl",
            "app/src/data/linkHistoryData.ts",
            "docs/surface-snapshot.json",
        ):
            self.assertIn(
                path, add, msg=f"expected {path} to ride in the same commit as the row that moved it"
            )
        self.assertEqual(
            step.count("git commit"), 1, msg="expected one commit for the three files, not one per file"
        )

    def test_the_record_runs_after_a_row_exists_and_before_staging(self):
        step = self.record_step()
        generate = step.find("python3 scripts/generate_link_history_data.py")
        gate = step.find("git diff --quiet")
        record = step.find("python3 scripts/record_links_surface.py")
        add = step.find("git add")
        self.assertGreaterEqual(generate, 0, msg="expected the step to regenerate the module first")
        self.assertLess(gate, record, msg="expected no record on a run that wrote no row: the early exit is before it")
        self.assertLess(
            record,
            add,
            msg="expected the measurement before staging, or the commit carries the old numbers",
        )

    def test_the_workbench_is_built_for_the_record(self):
        step = self.record_step()
        self.assertIn(
            "npm run build", step, msg="expected a build before the record, or the sweep measures nothing"
        )
        self.assertIn(
            "install chromium",
            step,
            msg="expected a browser for the sweep, since the weekly job does not otherwise need one",
        )
        workflow = self.WORKFLOW.read_text(encoding="utf-8")
        self.assertIn(
            "actions/setup-node",
            workflow,
            msg="expected Node to be set up, or npm ci and the build fail on the runner",
        )

    def test_the_gate_job_no_longer_claims_the_record(self):
        text = self.CI_WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn(
            "record_links_surface.py",
            text,
            msg="expected one owner for the record: the job that writes the data, not the gate job",
        )

    def test_the_job_may_push_the_commit_it_makes(self):
        workflow = self.WORKFLOW.read_text(encoding="utf-8")
        self.assertIn(
            "contents: write",
            workflow[: workflow.index("jobs:")],
            msg="expected write permission at the workflow level, or the push fails silently",
        )


class SweepContractTests(unittest.TestCase):
    """The read starts from the top of the page, because every number is viewport-relative.

    The first version of the data-follow step was written against a 47 px disagreement it blamed on
    the job. It was the window: the full sweep clicks eleven tabs before it reaches `tab-links`, the
    window is left scrolled, and `getBoundingClientRect` reported the whole page 47 px higher. A
    snapshot that depends on where the page happens to be scrolled is a flaky gate, so the reset is
    pinned here rather than left as a comment.
    """

    def sweep_text(self) -> str:
        self.assertTrue(
            SWEEP.exists(), f"expected the snapshot sweep at {SWEEP}; a moved file would stop this check"
        )
        return SWEEP.read_text(encoding="utf-8")

    def test_the_scroll_is_reset_before_each_measurement(self):
        text = self.sweep_text()
        reset = text.find("window.scrollTo")
        measure = text.find("page.evaluate(measure")
        self.assertGreater(
            reset, 0, msg="expected the sweep to reset the scroll, and it does not: boxes would float"
        )
        self.assertLess(
            reset,
            measure,
            msg="expected the scroll reset before the measurement, or the read is scroll-dependent",
        )

    def test_the_reset_is_checked_and_not_only_asked_for(self):
        text = self.sweep_text()
        self.assertIn(
            "window.scrollY === 0",
            text,
            msg="expected the sweep to wait for scrollY 0, since a smooth reset would measure mid-scroll",
        )


class ParseTests(unittest.TestCase):
    def test_the_sweeps_json_parses_when_it_is_the_whole_stream(self):
        body = {"drift": [], "stale": []}
        self.assertEqual(
            rec.parse_body(json.dumps(body)), body, msg="expected a clean JSON stream to parse as itself"
        )

    def test_it_parses_when_a_rebuild_wrote_first(self):
        # `ensureBuilt` runs `npm run build` through the sweep's stdout, so the JSON is the tail.
        stream = "vite v6 building for production...\n(!) some chunks are larger than 500 kB\n" + json.dumps(
            {"drift": rows("dark/tab-links"), "stale": []}, indent=2
        )
        body = rec.parse_body(stream)
        self.assertIsNotNone(
            body, msg="expected the tail of a rebuilt run's stdout to parse as the sweep's body"
        )
        self.assertEqual(
            len(body["drift"]), 1, msg="expected the parsed body to keep the drift rows it carried"
        )

    def test_garbage_is_not_parsed_as_an_empty_surface(self):
        self.assertIsNone(
            rec.parse_body("no json here\n"), msg="expected prose to parse as nothing rather than as drift"
        )
        self.assertIsNone(
            rec.parse_body(""), msg="expected an empty stream to parse as nothing rather than as drift"
        )


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
        self.assertEqual(
            status, 0, msg="expected a still surface to exit 0 so the data commit can go on its own"
        )
        self.assertFalse(
            record.called, msg="expected no re-record when the sweep found nothing to record"
        )

    def test_boxes_on_the_links_tab_are_recorded_and_confirmed(self):
        status, record = self.run_script(
            sweeps=[{"drift": rows("dark/tab-links"), "stale": []}, {"drift": [], "stale": []}]
        )
        self.assertEqual(
            status, 0, msg="expected a geometry-only move to be recorded and leave the sweep clean"
        )
        self.assertEqual(
            record.call_count, 1, msg="expected exactly one re-record call, then a confirmation sweep"
        )
        argv = record.call_args.args[0]
        self.assertIn(
            "--record", argv, msg="expected the re-record to go through the sweep's own --record flag"
        )
        self.assertEqual(
            argv[-2:],
            ["--tab", "tab-links"],
            msg="expected one surface in every palette, which is the sweep's --tab form",
        )

    def test_a_count_on_the_links_tab_fails_without_recording(self):
        status, record = self.run_script(sweeps=[{"drift": rows("dark/tab-links", part="counts"), "stale": []}])
        self.assertEqual(
            status, 1, msg="expected a count that moved to fail the step rather than be recorded"
        )
        self.assertFalse(record.called, msg="expected no re-record attempt when the drift was refused")

    def test_a_record_that_leaves_drift_still_fails(self):
        status, _ = self.run_script(
            sweeps=[{"drift": rows("dark/tab-links"), "stale": []}, {"drift": rows("dark/tab-links"), "stale": []}]
        )
        self.assertEqual(
            status, 1, msg="expected the confirmation sweep to decide, not the re-record's exit code"
        )

    def test_recording_off_the_runner_is_refused(self):
        status, record = self.run_script(ambient_ci=None, sweeps=[{"drift": rows("dark/tab-links"), "stale": []}])
        self.assertEqual(
            status, 2, msg="expected a record without CI set to be refused before anything is written"
        )
        self.assertFalse(record.called, msg="expected the refusal to happen before the sweep writes a byte")

    def test_dry_run_says_what_it_would_write(self):
        status, record = self.run_script("--dry-run", sweeps=[{"drift": rows("dark/tab-links"), "stale": []}])
        self.assertEqual(
            status, 0, msg="expected a dry run to report the drift and exit 0 without writing"
        )
        self.assertFalse(record.called, msg="expected a dry run to write nothing at all")

    def test_check_fails_when_a_re_record_is_due(self):
        status, record = self.run_script("--check", sweeps=[{"drift": rows("dark/tab-links"), "stale": []}])
        self.assertEqual(
            status, 1, msg="expected --check to exit 1 when a re-record is due, as a gate should"
        )
        self.assertFalse(record.called, msg="expected --check to compare only, never to re-record")


if __name__ == "__main__":
    unittest.main()
