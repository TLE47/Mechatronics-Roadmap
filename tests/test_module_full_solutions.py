"""The Full Solution a module page prints must pass the package it introduces.

Dogfooding found pages whose pasted Full Solution had drifted from
`exercises/<id>/solution.py`: the page omitted every input guard the suite checks (an empty trace, a
missing calibration key, a negative resistance, a zero inertia), some pages had lost a function
altogether, and one printed no `simulate_discrete`. A learner who copies the page then fails tests
the page never mentions - so the page is checked against the same suite the learner runs.

The list is discovered, not typed: every exercise package with a module page that prints a
`### Full Solution` block is checked. That is how the drift was measured at 26 of 46 pages and then
repaired; a new module joins the check the moment its page gets a solution block.
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def pages_with_solutions():
    """(module id, page text) for every package whose page prints a Full Solution block."""
    for manifest in sorted((ROOT / "exercises").glob("*/exercise.json")):
        module_id = json.loads(manifest.read_text(encoding="utf-8"))["id"]
        page = ROOT / "modules" / (module_id + ".md")
        if not page.exists():
            continue
        text = page.read_text(encoding="utf-8")
        if "### Full Solution" not in text:
            continue
        if not re.search(r"```python\n.*?\n```", text.split("### Full Solution", 1)[1], re.S):
            continue
        yield module_id, text


def full_solution_block(page_text, module_id):
    """The first ```python block after `### Full Solution` in the module page."""
    tail = page_text.split("### Full Solution", 1)[1]
    match = re.search(r"```python\n(.*?)\n```", tail, re.S)
    if match is None:
        raise AssertionError("no python block after '### Full Solution' in " + module_id)
    return match.group(1) + "\n"


class PageSolutionTests(unittest.TestCase):
    def test_the_check_covers_the_whole_course(self):
        # A rename that empties the discovery would otherwise pass silently.
        found = [module_id for module_id, _text in pages_with_solutions()]
        self.assertGreaterEqual(
            len(found), 40,
            f"expected at least 40 module pages with a Full Solution block, found "
            f"{len(found)}: {found} - check the exercises/*/exercise.json glob and the "
            f"'### Full Solution' heading, which a retitled section would break",
        )

    def test_each_page_full_solution_passes_its_package(self):
        for module_id, page_text in pages_with_solutions():
            with self.subTest(module=module_id):
                code = full_solution_block(page_text, module_id)
                with tempfile.TemporaryDirectory() as scratch:
                    submission = pathlib.Path(scratch) / "page_solution.py"
                    submission.write_text(code, encoding="utf-8")
                    env = dict(os.environ, EXERCISE_TARGET=str(submission))
                    proc = subprocess.run(
                        [sys.executable, "-m", "unittest", "discover",
                         "-s", str(ROOT / "exercises" / module_id), "-p", "test_*.py"],
                        cwd=str(ROOT), env=env, capture_output=True, text=True,
                    )
                self.assertEqual(
                    proc.returncode, 0,
                    f"{module_id} page solution fails its own suite, so a learner copying the "
                    f"page meets tests the page never mentions; check the block against "
                    f"exercises/{module_id}/solution.py:\n{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}",
                )


if __name__ == "__main__":
    unittest.main()
