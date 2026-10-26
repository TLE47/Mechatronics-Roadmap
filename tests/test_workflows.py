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


CI = os.path.join(ROOT, ".github", "workflows", "ci.yml")

# The browser work, and the job it moved to. A suite that is listed in neither place is a gate that
# silently stopped running, which is the failure a speedup invites.
BROWSER_SUITES = (
    "npm run test:workbench",
    "npm run test:e2e:game",
    "npm run test:theme:e2e",
    "npm run check:axe",
    "npm run check:lighthouse",
    "npm run check:snapshot",
    "npm run check:labels",
    "npm run test:runtime",
    "npm run test:offline",
)
SUITE_JOBS = ("workbench-suites", "audit-suites", "runtime-suites")


def ci_text():
    return read(CI)


def job_block(text, name):
    """One job's body: from its two-space key to the next two-space key."""
    match = re.search(r"^  %s:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)" % re.escape(name), text, re.M | re.S)
    return match.group(1) if match else ""


class WorkflowSpeedTests(unittest.TestCase):
    """The CI shape: one run per push, a split, a cached browser, one bundle.

    These are the properties the speedup cannot keep by intent. A wildcard branch filter, a suite
    job that rebuilds, a second Playwright install with no cache, or a deploy that no longer waits
    for the audits are each one line away from coming back, and each one quietly costs a round trip
    or a gate rather than failing a test on its own.
    """

    def test_a_feature_branch_push_starts_one_run_not_two(self):
        ci = ci_text()
        match = re.search(r"^  push:\n(.*?)(?=^  [a-z_]+:\n)", ci, re.M | re.S)
        self.assertIsNotNone(match, msg="expected ci.yml to declare an `on.push` block")
        branches = re.findall(r'"([^"]+)"', match.group(1))
        self.assertEqual(
            branches,
            ["main", "master"],
            msg="expected a push to start a run only on the deployed branches; a wildcard here "
            "grades a feature branch twice (once for the push, once for its pull request), "
            "which was one of the two runs this shape exists to stop paying for",
        )

    def test_the_run_a_newer_push_supersedes_is_cancelled(self):
        ci = ci_text()
        match = re.search(r"^concurrency:\n(.*?)(?=^\S)", ci, re.M | re.S)
        self.assertIsNotNone(match, msg="expected ci.yml to have a top-level `concurrency:` block")
        block = match.group(1)
        self.assertIn(
            "github.event.pull_request.number",
            block,
            msg="expected the group to be the pull request's own, so an update cancels the run it "
            "supersedes instead of queueing beside it",
        )
        self.assertIn(
            "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
            block,
            msg="expected cancellation on a pull request only: cancelling a `main` run would kill "
            "the run that publishes the site",
        )

    def test_every_browser_suite_still_runs_somewhere_exactly_once(self):
        ci = ci_text()
        for command in BROWSER_SUITES:
            with self.subTest(command=command):
                self.assertEqual(
                    ci.count(command),
                    1,
                    msg=f"expected {command} to appear once in ci.yml: a suite that moved jobs and "
                    "was left behind is a gate nobody is watching",
                )

    def test_the_browser_jobs_share_the_build_instead_of_remaking_it(self):
        ci = ci_text()
        build = job_block(ci, "build-workbench")
        self.assertEqual(
            build.count("actions/upload-artifact@v4"),
            1,
            msg="expected the build job to publish the bundle exactly once for the suite jobs",
        )
        self.assertIn("name: workbench-dist", build, msg="expected the published artifact to carry the name the suite jobs download")
        for name in SUITE_JOBS:
            block = job_block(ci, name)
            with self.subTest(job=name):
                self.assertTrue(block, msg=f"expected a `{name}` job in ci.yml; check the job was not renamed or folded back into the build")
                self.assertIn(
                    "needs: build-workbench",
                    block,
                    msg="expected the suite job to wait for the one build, not to race it",
                )
                self.assertIn(
                    "actions/download-artifact@v4",
                    block,
                    msg="expected the suite job to fetch the built bundle",
                )
                self.assertIn("name: workbench-dist", block, msg="expected the same artifact name the build job published")
                self.assertNotIn(
                    "npm run build",
                    block,
                    msg="expected no rebuild in a suite job: the same commit produces the same "
                    "bytes, and building three times is the wall-clock this split removed",
                )
                self.assertIn(
                    "find dist -exec touch",
                    block,
                    msg="expected the restored bundle to be stamped newer than the checkout: an "
                    "archive keeps the build job's timestamps, so without this every suite would "
                    "read it as stale and rebuild it",
                )

    def test_the_playwright_download_is_cached(self):
        ci = ci_text()
        for name in SUITE_JOBS:
            block = job_block(ci, name)
            with self.subTest(job=name):
                self.assertIn("actions/cache@v4", block, msg="expected a cache step for the Playwright browsers in every suite job")
                self.assertIn(
                    "~/.cache/ms-playwright",
                    block,
                    msg="expected the cache to name the directory the browsers land in",
                )
                self.assertIn(
                    "hashFiles('package-lock.json')",
                    block,
                    msg="expected the cache key to follow the lockfile: an upgraded Playwright must "
                    "not be handed the old browser build",
                )

    def test_publishing_waits_for_every_browser_suite(self):
        ci = ci_text()
        deploy = job_block(ci, "deploy-pages")
        self.assertTrue(deploy, msg="expected a deploy-pages job: without it a green run would never publish the site")
        self.assertIn(
            "needs: [build-workbench, %s]" % ", ".join(SUITE_JOBS),
            deploy,
            msg="expected the deploy to depend on every suite job: a red audit must not publish "
            "the bundle it graded",
        )


if __name__ == "__main__":
    unittest.main()
