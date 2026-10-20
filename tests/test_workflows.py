#!/usr/bin/env python3
"""Every workflow that runs Python must set up the interpreter the repo pins.

`scripts/check_links.py` refuses to run on anything but the version in `.python-version` (3.12)
and exits 2, so a job that leaves Actions' default interpreter in place fails before doing any
work. That is exactly what happened to the daily revalidation workflow: it pinned 3.11, and the
scheduled run died on the version guard with `No files were found with the provided path:
.link_cache.json` as the only other clue. The failure looked like a missing cache rather than a
wrong interpreter.

These tests read the workflow files as text on purpose: PyYAML is not a dependency of this repo,
and the property being checked (a pinned setup step exists in a file that runs `python3`) needs
no YAML parser.

Run: `python3 tests/test_workflows.py` (also discovered by `python3 -m unittest discover`).
"""

import glob
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS = sorted(glob.glob(os.path.join(ROOT, ".github", "workflows", "*.yml")))
PINNED = open(os.path.join(ROOT, ".python-version"), encoding="utf-8").read().strip()


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


class WorkflowPythonTests(unittest.TestCase):
    def test_every_workflow_that_runs_python_pins_the_repo_version(self):
        for path in WORKFLOWS:
            text = read(path)
            if not re.search(r"\bpython3(?:\s|$)", text, re.MULTILINE):
                continue
            name = os.path.basename(path)
            with self.subTest(workflow=name):
                self.assertIn(
                    'python-version: "%s"' % PINNED,
                    text,
                    msg=f"expected {name} to set up Python {PINNED} before it runs a script; "
                        "Actions' default interpreter is not the one `.python-version` pins, "
                        "and check_links.py exits 2 on it",
                )

    def test_no_workflow_asks_for_another_python_version(self):
        found = {}
        for path in WORKFLOWS:
            for version in re.findall(r'python-version:\s*"([^"]+)"', read(path)):
                found.setdefault(version, []).append(os.path.basename(path))
        self.assertEqual(
            sorted(found),
            [PINNED],
            msg=f"expected every workflow to pin Python {PINNED}, the version in "
                "`.python-version`; a second version is how the daily revalidation job died "
                "on its first script",
        )

    def test_the_daily_revalidation_sweeps_with_the_pinned_interpreter(self):
        path = os.path.join(ROOT, ".github", "workflows", "revalidate-links.yml")
        text = read(path)
        self.assertIn(
            "check_links.py --revalidate-unverified",
            text,
            msg="expected the daily workflow to keep revalidating only the unverified hosts; "
                "a full sweep there would re-fetch the served pages the cache exists to avoid",
        )
        setup = text.find('python-version: "%s"' % PINNED)
        sweep = text.find("check_links.py --revalidate-unverified")
        self.assertNotEqual(
            setup,
            -1,
            msg=f"expected the daily revalidation workflow to pin Python {PINNED}; it ran "
                "on 3.11 and check_links.py exited 2 before fetching a URL",
        )
        self.assertLess(
            setup,
            sweep,
            msg="expected the interpreter setup to come before the sweep; a pinned version "
                "declared after the command it pins fixes nothing",
        )


if __name__ == "__main__":
    unittest.main()
