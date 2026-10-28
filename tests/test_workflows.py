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
    "npm run test:e2e:game",
    "npm run test:theme:e2e",
    "npm run check:axe",
    "npm run check:lighthouse",
    "npm run check:snapshot",
    "npm run check:labels",
    "npm run test:runtime",
    "npm run test:offline",
)
# The lanes that carry a browser and its cache.
LANE_JOBS = (
    "e2e-suites",
    "bundle-suites",
    "bundle-firefox-suites",
    "audit-theme",
    "audit-visuals",
    "runtime-suites",
)
# The lanes that grade `dist/`, so they wait for the one build and fetch its artifact. `e2e-suites`
# deliberately does not: it drives the dev server, and everything that reads the built bundle was
# moved to these lanes so that no browser test waits on the build handoff.
DIST_JOBS = ("bundle-suites", "bundle-firefox-suites", "audit-theme", "audit-visuals", "runtime-suites")

# The matrix runner and its three lanes. A partition CI names and the runner does not have is a job
# that dies on its first command; a browser suite in no partition is a gate nobody runs.
MATRIX_RUNNER = os.path.join(ROOT, "scripts", "test_workbench.mjs")
PARTITIONS = ("e2e", "bundle", "bundle-firefox")


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
        for name in DIST_JOBS:
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

    def test_the_dev_server_lane_does_not_wait_for_the_build(self):
        """The dev-server lane reads no `dist/`, so it must not sit behind the build.

        That handoff was 42s of a run whose browser lanes are already the floor (run 40623055372:
        build started at 02:48:14, suites at 02:48:55). The coverage does not move with it: the three
        suites that read the built bundle (the SSR smoke, the weight budget, the fonts) are declared
        in the lane that carries it, and `test_the_build_does_not_wait_on_the_python_gate` keeps the
        gate itself green.
        """
        build_lane = job_block(ci_text(), "e2e-suites")
        self.assertTrue(build_lane, msg="expected an `e2e-suites` job in ci.yml; check the job was not renamed")
        active = "\n".join(
            line for line in build_lane.splitlines() if not line.strip().startswith("#")
        )
        self.assertNotIn(
            "needs:",
            active,
            msg="expected the dev-server lane to start at t=0: a `needs:` here is the build "
            "handoff this lane exists to skip",
        )
        self.assertNotIn(
            "actions/download-artifact@v4",
            active,
            msg="expected no artifact in the dev-server lane: it would be a download for a bundle "
            "none of its suites read",
        )
        self.assertNotIn(
            "npm run build",
            active,
            msg="expected the dev-server lane to build nothing either: `--partition e2e` carries no "
            "`dist/` reader, and a build here is the same bytes a second time",
        )

    def test_every_button_that_reads_dist_rides_with_the_artifact(self):
        """A suite that grades the built bundle may only live in a lane that fetches the build.

        The dev-server lane lost its `needs:` and its artifact step, so a `dist/` reader put there
        would fail on a missing bundle - or, worse, build one of its own and hide that the lane is no
        longer artifact-free. The runner says which suites read the bundle (`needsBundle`); this asks
        CI whether the lane it names carries one.
        """
        with open(MATRIX_RUNNER, encoding="utf-8") as handle:
            runner = handle.read()
        lanes = {partition: lane for partition, lane in zip(PARTITIONS, DIST_JOBS)}
        readers = [line for line in runner.splitlines() if "needsBundle: true" in line]
        self.assertTrue(readers, msg="expected the runner to declare which suites read `dist/`")
        ci = ci_text()
        for line in readers:
            match = re.search(r"partition: '([\w-]+)'", line)
            with self.subTest(suite=line.strip()[:60]):
                self.assertIsNotNone(
                    match,
                    msg="expected every `dist/` reader to name the lane that carries the build",
                )
                job = lanes[match.group(1)]
                self.assertIn(
                    "actions/download-artifact@v4",
                    job_block(ci, job),
                    msg=f"expected `{job}` to fetch the build: it carries a suite that reads `dist/`",
                )

    def test_the_playwright_download_is_cached(self):
        ci = ci_text()
        for name in LANE_JOBS:
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

    def test_the_audits_are_two_jobs_not_one_queue(self):
        """Five checks in one job were 3m54 of steps that never overlapped.

        Measured on run 40623055372: theme 56s, axe 59s, Lighthouse 41s, snapshot 75s, labels 3s. Split
        by what they measure, each lane is about two minutes; merged back into one, this lane is again
        the second-longest thing in a run whose browser lanes are already two.
        """
        ci = ci_text()
        self.assertNotIn(
            "audit-suites:",
            ci,
            msg="expected the single audit job to be gone: five sequential checks in one job were "
            "4m14 end to end",
        )
        theme = job_block(ci, "audit-theme")
        visuals = job_block(ci, "audit-visuals")
        self.assertTrue(theme and visuals, msg="expected `audit-theme` and `audit-visuals` jobs")
        for command in ("npm run test:theme:e2e", "npm run check:axe"):
            with self.subTest(job="audit-theme", command=command):
                self.assertIn(
                    command,
                    theme,
                    msg="expected this check in `audit-theme`; a command that moved lanes without a "
                    "test moving with it is a gate nobody is watching",
                )
                self.assertNotIn(command, visuals, msg="expected each check in exactly one audit job")
        for command in ("npm run check:lighthouse", "npm run check:snapshot", "npm run check:labels"):
            with self.subTest(job="audit-visuals", command=command):
                self.assertIn(
                    command,
                    visuals,
                    msg="expected this check in `audit-visuals`; a command that moved lanes without a "
                    "test moving with it is a gate nobody is watching",
                )
                self.assertNotIn(command, theme, msg="expected each check in exactly one audit job")

    def test_the_matrix_runs_as_three_lanes_once_each(self):
        """Three jobs, each naming one lane of the matrix, and no lane run twice.

        The split exists because `e2e` alone is longer than five minutes: it travels with the light
        flows and the control pairs, the built bundle in Chromium gets the tour and the reading
        flows, and the built bundle in Firefox gets the three suites that read it. A job
        that named a partition the runner does not know would die on its first command, and a
        suite in neither half would silently stop being a gate - so both are checked here.
        """
        ci = ci_text()
        self.assertEqual(
            ci.count("npm run test:workbench"),
            3,
            msg="expected the matrix exactly three times, once per lane; a fourth call is the same "
            "matrix again, and two calls is a lane that lost its job",
        )
        for partition in PARTITIONS:
            with self.subTest(partition=partition):
                # Not a substring: `--partition bundle` is a prefix of `--partition bundle-firefox`,
                # and a plain count would read one lane as two.
                self.assertEqual(
                    len(re.findall(r"-- --partition %s(?![\w-])" % re.escape(partition), ci)),
                    1,
                    msg=f"expected exactly one job to run the `{partition}` partition",
                )

    def test_the_pages_sweep_runs_both_engines_in_separate_lanes(self):
        """One engine per process, both engines in CI.

        Two headless browsers in one process were paying for each other's paint: 164.2s on run
        40623055372, and that suite alone was the lane's floor. Split, each lane is one engine's
        path; the coverage is the same, because Chromium still grades every exercise entry and
        Firefox the sample, and neither lane may quietly drop its engine.
        """
        with open(MATRIX_RUNNER, encoding="utf-8") as handle:
            runner = handle.read()
        for engine in ("chromium", "firefox"):
            with self.subTest(engine=engine):
                self.assertIn(
                    "PLAYWRIGHT_BROWSERS: '%s'" % engine,
                    runner,
                    msg=f"expected a `pages` entry that runs the built bundle in {engine} alone",
                )
        lanes = [
            line
            for line in runner.splitlines()
            if "e2e_pages_bundle.mjs" in line and "browser: true" in line
        ]
        self.assertEqual(
            len(lanes),
            2,
            msg="expected the Pages sweep exactly twice, one engine per lane",
        )
        self.assertNotEqual(
            lanes[0].split("partition:")[1].split(",")[0],
            lanes[1].split("partition:")[1].split(",")[0],
            msg="expected the two engines in different lanes: in one lane they contend for the same "
            "cores again, which is the 164s this split removed",
        )
        self.assertIn(
            "PAGES_GRADING: 'sample'",
            runner,
            msg="expected the second engine's lane to grade the sample: the exhaustive pass belongs to "
            "the Chromium lane, and grading all 50 entries again is the twice-the-interpreter-runs "
            "cost this suite already removed once",
        )

    def test_every_browser_suite_names_a_partition(self):
        with open(MATRIX_RUNNER, encoding="utf-8") as handle:
            runner = handle.read()
        browser_lines = [line for line in runner.splitlines() if "browser: true" in line]
        self.assertGreaterEqual(
            len(browser_lines),
            14,
            msg="expected the runner to list its browser suites as data; the partition check below "
            "reads those lines",
        )
        for line in browser_lines:
            with self.subTest(suite=line.strip()[:60]):
                self.assertIn(
                    "partition:",
                    line,
                    msg="expected every browser suite to name a partition: one with no partition "
                    "is rejected at startup and, before that check existed, would have been a gate "
                    "that stopped running in the split",
                )
        for partition in PARTITIONS:
            with self.subTest(partition=partition):
                self.assertTrue(
                    any("partition: '%s'" % partition in line for line in browser_lines),
                    msg=f"expected at least one browser suite in the `{partition}` partition",
                )

    def test_the_build_does_not_wait_on_the_python_gate(self):
        """The gate blocks the merge, not the machine.

        `build-workbench` used to carry `needs: verify-and-test`, so nothing browser-shaped started
        until the slowest leg of the Python sweep finished - the macOS one, 1m57s on run
        40616101620 - and the run paid 2m40s before its first browser test. A run is green only when
        every job passed, so the gate still holds without the handoff.
        """
        build = job_block(ci_text(), "build-workbench")
        self.assertTrue(build, msg="expected a `build-workbench` job in ci.yml")
        # The job's own comment names the shape it replaced, so only real lines are asked.
        active = "\n".join(
            line for line in build.splitlines() if not line.strip().startswith("#")
        )
        self.assertNotIn(
            "needs:",
            active,
            msg="expected the build to start on its own: a `needs:` here is a runner handoff, and "
            "`needs: verify-and-test` kept the browser lane parked behind the Python sweep for "
            "2m40s",
        )

    def test_the_browser_libraries_ride_a_cache_miss_only(self):
        """The one measured outlier: `--with-deps` on a cache miss took 17m31s.

        The browsers are cached, but that step re-ran the apt half on every job; on run 40559024836
        it pulled ~30 packages from a throttled mirror and held the whole run for seventeen minutes.
        The libraries belong to the miss that needs them, and both steps are bounded so a slow
        mirror fails the run in minutes instead of stalling it.
        """
        ci = ci_text()
        for name in LANE_JOBS:
            block = job_block(ci, name)
            with self.subTest(job=name):
                self.assertIn(
                    "id: playwright-cache",
                    block,
                    msg="expected the cache step to have an id: the library step reads its outcome",
                )
                self.assertNotIn(
                    "--with-deps",
                    block,
                    msg="expected no `--with-deps`: it re-runs apt on a cache hit and spent 17m31s "
                    "on the one miss measured",
                )
                self.assertIn(
                    "npx playwright-core install chromium firefox",
                    block,
                    msg="expected the browsers installed on their own",
                )
                self.assertIn(
                    "npx playwright-core install-deps chromium firefox",
                    block,
                    msg="expected the OS libraries installed on their own, so they can be conditional",
                )
                self.assertIn(
                    "if: steps.playwright-cache.outputs.cache-hit != 'true'",
                    block,
                    msg="expected the library step to run only on a cache miss",
                )
                self.assertEqual(
                    block.count("timeout-minutes:"),
                    2,
                    msg="expected both Playwright steps bounded: a throttled mirror must fail the "
                    "run in minutes, not hold it for seventeen",
                )

    def test_publishing_waits_for_every_browser_suite(self):
        ci = ci_text()
        deploy = job_block(ci, "deploy-pages")
        self.assertTrue(deploy, msg="expected a deploy-pages job: without it a green run would never publish the site")
        self.assertIn(
            "needs: [verify-and-test, build-workbench, %s]" % ", ".join(LANE_JOBS),
            deploy,
            msg="expected the deploy to depend on every suite job and on the Python sweep: the "
            "sweep used to ride along inside the build's `needs:`, so a red sweep that no longer "
            "delays the browser lane must still stop the publish",
        )


if __name__ == "__main__":
    unittest.main()
