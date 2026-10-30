#!/usr/bin/env python3
"""The surface comparator's contract runs without a browser (`tests/test_snapshot_compare.py`).

`check:snapshot` exits 0 when every recorded surface matches; the browser sweep supplies the
measurements, and `scripts/snapshot_compare.mjs` decides. Nothing in the repo exercised that decision:
raising the tolerance, ignoring a count, dropping a palette entry or a box from either side all passed.
The cases live beside the code they exercise (`scripts/test_snapshot_compare.mjs`, a table of moved
numbers and the row each must name), and this runs them through the unittest discovery that
`check:all --full` and CI already execute, so a comparator that stops biting turns the suite red.

Run: `python3 tests/test_snapshot_compare.py` (also discovered by `python3 -m unittest discover`).
"""

import os
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRACT = os.path.join(ROOT, "scripts", "test_snapshot_compare.mjs")
COMPARATOR = os.path.join(ROOT, "scripts", "snapshot_compare.mjs")
SWEEP = os.path.join(ROOT, "scripts", "snapshot_surfaces.mjs")


class SnapshotCompareTests(unittest.TestCase):
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
            msg="expected the comparator contract to pass; a failing case means `check:snapshot` "
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
            "from './snapshot_compare.mjs'",
            sweep,
            msg="expected the browser sweep to import scripts/snapshot_compare.mjs: the contract "
            "tests that module, so a copied comparator inside the sweep would let the tested copy "
            "drift from the one that decides the gate",
        )
        self.assertTrue(
            os.path.exists(COMPARATOR),
            msg="expected scripts/snapshot_compare.mjs to exist, the module the sweep imports",
        )


if __name__ == "__main__":
    unittest.main()
