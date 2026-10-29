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
