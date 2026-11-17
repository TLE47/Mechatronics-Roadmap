#!/usr/bin/env python3
"""The micro-visual comparator's contract runs without a browser (`tests/test_micro_visual_compare.py`).

`check:micro-visuals` exits 0 when every recorded scene and width matches; the browser sweep supplies
the measurements, and `scripts/micro_visual_compare.mjs` decides. Nothing else exercises that decision:
dropping a label, a text run, a style fingerprint, a vector fingerprint or an issue from either side
all passed if the comparator ignored it. The cases live beside the code they exercise
(`scripts/test_micro_visual_compare.mjs`), and this runs them through the unittest discovery that
`check:all --full` and CI already execute, so a comparator that stops biting turns the suite red.

Run: `python3 tests/test_micro_visual_compare.py` (also discovered by `python3 -m unittest discover`).
"""

import os
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRACT = os.path.join(ROOT, "scripts", "test_micro_visual_compare.mjs")
COMPARATOR = os.path.join(ROOT, "scripts", "micro_visual_compare.mjs")
SWEEP = os.path.join(ROOT, "scripts", "check_micro_visuals.mjs")
BASELINE = os.path.join(ROOT, "docs", "micro-visual-snapshot.json")


class MicroVisualCompareTests(unittest.TestCase):
    def test_the_comparator_contract_bites(self):
        node = shutil.which("node")
        self.assertIsNotNone(
            node,
            msg="expected node on PATH: the comparator is JavaScript and its contract cannot run "
            "without the runtime CI installs before the unittest step",
        )
        result = subprocess.run(
            [node, CONTRACT],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg="expected the comparator contract to pass; a failing case means `check:micro-visuals` "
            f"accepts drift it must reject:\n{result.stdout}\n{result.stderr}",
        )
        self.assertIn(
            "passed, 0 failed",
            result.stdout,
            msg="expected the contract to print its own count: a suite that stops running cases "
            "would otherwise read as a pass",
        )

    def test_the_sweep_uses_the_comparator_the_contract_exercises(self):
        with open(SWEEP, encoding="utf-8") as handle:
            sweep = handle.read()
        self.assertIn(
            "from './micro_visual_compare.mjs'",
            sweep,
            msg="expected the browser sweep to import scripts/micro_visual_compare.mjs: the contract "
            "tests that module, so a copied comparator inside the sweep would let the tested copy "
            "drift from the one that decides the gate",
        )
        self.assertTrue(
            os.path.exists(COMPARATOR),
            msg="expected scripts/micro_visual_compare.mjs to exist, the module the sweep imports",
        )

    def test_the_recording_covers_every_scene_at_both_widths(self):
        import json

        self.assertTrue(
            os.path.exists(BASELINE),
            msg="expected docs/micro-visual-snapshot.json; record it with "
            "`npm run check:micro-visuals -- --record`",
        )
        with open(BASELINE, encoding="utf-8") as handle:
            baseline = json.load(handle)
        self.assertEqual(
            baseline.get("widths"),
            [477, 966],
            msg="expected the recording to name 477 and 966 px; check the widths field, since a "
            "scene measured at only one placement is the gap this gate exists to close",
        )
        self.assertEqual(
            len(baseline.get("scenes", {})),
            46,
            msg="expected all 46 scenes in docs/micro-visual-snapshot.json; check the catalogue "
            "and re-record the snapshot if a scene was added or removed",
        )
        for scene, widths in baseline["scenes"].items():
            self.assertEqual(
                sorted(widths),
                ["477", "966"],
                msg=f"expected {scene} to record both placement widths; check the scene's 477 "
                "and 966 px entries, since only one placement leaves the other unmeasured",
            )


if __name__ == "__main__":
    unittest.main()
