"""The Board card's data is generated, so it must never be edited by hand (`tests/test_board_bridge_data.py`).

`app/src/data/boardBridges.json` carries each Stage-0 Arduino lesson's own sketch and the serial CI
proves for it (`scripts/extract_and_compile_sketches.py --write-panel`). The failure this test exists
for is the quiet one: a lesson edits its `Full Solution`, the page and CI move together, and the card
keeps rendering the sketch from before - teaching a program the course no longer ships.

Run: `python3.12 tests/test_board_bridge_data.py`
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import extract_and_compile_sketches as sketches  # noqa: E402


class BoardPanelDriftTests(unittest.TestCase):
    def test_the_committed_file_matches_the_lesson_pages(self):
        problems = sketches.check_panel()
        self.assertEqual(
            problems,
            [],
            msg="expected app/src/data/boardBridges.json to match the lessons; "
            "run `python3 scripts/extract_and_compile_sketches.py --write-panel` to regenerate it",
        )

    def test_every_arduino_lesson_page_contributes_one_bridge(self):
        document = sketches.panel_document()
        self.assertEqual(
            len(document["bridges"]),
            len(sketches.ARDUINO_LESSON_FILES),
            msg="expected one board per Arduino lesson page; a lesson with no card cannot be opened",
        )
        ids = [bridge["id"] for bridge in document["bridges"]]
        self.assertEqual(
            len(ids),
            len(set(ids)),
            msg=f"expected one bridge per lesson id; a duplicate id would render twice: {ids}",
        )

    def test_a_lesson_that_edits_its_sketch_is_reported(self):
        document = sketches.panel_document()
        with tempfile.TemporaryDirectory() as tmp:
            stale = os.path.join(tmp, "boardBridges.json")
            document["bridges"][0]["solution"] += "\n// a change the page does not have\n"
            with open(stale, "w", encoding="utf-8") as handle:
                json.dump(document, handle, indent=2)
            problems = sketches.check_panel(stale)
        self.assertTrue(
            any("solution differs" in problem for problem in problems),
            msg=f"expected the edited sketch to be named as drift, likely a missing field check: {problems}",
        )

    def test_a_missing_file_says_how_to_generate_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = os.path.join(tmp, "boardBridges.json")
            problems = sketches.check_panel(missing)
        self.assertEqual(
            len(problems),
            1,
            msg=f"expected a single finding for a missing card file, not a traceback: {problems}",
        )
        self.assertIn(
            "--write-panel",
            problems[0],
            msg="expected the missing-file finding to name the command that writes the file",
        )

    def test_malformed_json_is_reported_rather_than_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            broken = os.path.join(tmp, "boardBridges.json")
            with open(broken, "w", encoding="utf-8") as handle:
                handle.write("{ not json")
            problems = sketches.check_panel(broken)
        self.assertEqual(
            len(problems),
            1,
            msg=f"expected one finding for unparseable JSON, likely a parse error path: {problems}",
        )
        self.assertIn(
            "not valid JSON",
            problems[0],
            msg="expected the parse failure to be described in words, not raised as an exception",
        )

    def test_the_cli_gate_exits_one_on_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            stale = os.path.join(tmp, "boardBridges.json")
            document = sketches.panel_document()
            document["bridges"] = document["bridges"][:-1]
            with open(stale, "w", encoding="utf-8") as handle:
                json.dump(document, handle, indent=2)
            result = subprocess.run(
                [sys.executable, os.path.join(ROOT, "scripts", "extract_and_compile_sketches.py"),
                 "--check-panel", stale],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
        self.assertEqual(
            result.returncode,
            1,
            msg=f"expected exit 1 for a stale card file, not {result.returncode}: {result.stderr}",
        )
        self.assertIn(
            "stale",
            result.stderr.lower(),
            msg="expected the gate to say the card data is stale, so the reader knows what happened",
        )
        self.assertIn(
            "--write-panel",
            result.stderr,
            msg="expected the failure to name the regeneration command; without it the fix is a guess",
        )


if __name__ == "__main__":
    unittest.main()
