#!/usr/bin/env python3
"""The exercise package is a contract, and this file checks the contract holds.

Four things can drift apart, and each has a test here:
  * the package and the module it belongs to (the module must link the package);
  * the package and its own three-way check (`scripts/run_exercise.py`);
  * the package and the generated workbench entry (`pythonLessonsData.ts`);
  * the workbench's expected output and the self-check that actually prints it.

Run: python3 tests/test_exercise_package.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXERCISES = os.path.join(ROOT, "exercises")
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import exercise_bundle  # noqa: E402
import generate_python_lessons_data  # noqa: E402


def packages():
    if not os.path.isdir(EXERCISES):
        return []
    return [
        os.path.join(EXERCISES, name)
        for name in sorted(os.listdir(EXERCISES))
        if os.path.isfile(os.path.join(EXERCISES, name, "exercise.json"))
    ]


class PackageContract(unittest.TestCase):
    """The package contract, checked against **one** run of `scripts/run_exercise.py`.

    That script already spawns each package's behaviour and transfer suites, its faults, its cheat
    submission and both flattened browser programs - about 340 interpreters for the 48 packages. The
    workbench checks below used to spawn the browser programs a second time (96 more starts, ~10 s)
    to reach the same verdicts, so they now read the run's own JSON report instead: one run, the same
    coverage, and no second opinion to drift.
    """

    @classmethod
    def setUpClass(cls):
        cls.three_way = None
        cls.source = "its own run"
        report_path = os.environ.get("RUN_EXERCISE_REPORT")
        if report_path and os.path.isfile(report_path):
            # CI runs the sweep once and points the suite at that report; the verdicts below are
            # the same object either way, and test_a_report_file_is_believed_only_when_it_says_pass
            # keeps the shortcut from hiding a failure.
            cls.source = report_path
            with open(report_path, encoding="utf-8") as handle:
                cls.reports = json.load(handle)
        else:
            cls.three_way = subprocess.run(
                [sys.executable, os.path.join(ROOT, "scripts", "run_exercise.py"), "--json"],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
            )
            try:
                cls.reports = json.loads(cls.three_way.stdout)
            except ValueError:
                cls.reports = []
        cls.checks = {report["id"]: {check["name"]: check for check in report["checks"]}
                      for report in cls.reports}

    def test_every_package_is_complete(self):
        self.assertTrue(
            packages(),
            f"expected at least one exercises/*/exercise.json under {EXERCISES}; found none - "
            f"check the directory name and that the manifests were not moved with the packages",
        )
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
            for name in ["starter.py", "solution.py", "selfcheck.py", "harness.py"]:
                self.assertTrue(
                    os.path.isfile(os.path.join(directory, name)),
                    f"expected {manifest['id']} to ship {name}; check the package directory, "
                    f"because run_exercise.py refuses a package missing any of the four",
                )
            module_path = os.path.join(ROOT, manifest["module"])
            self.assertTrue(
                os.path.isfile(module_path),
                f"expected the page {manifest['module']} to exist, since the manifest names it "
                f"as the module this package belongs to; check the `module` field for a rename",
            )
            with open(module_path, "r", encoding="utf-8") as handle:
                module_text = handle.read()
            self.assertIn(
                f"exercises/{manifest['id']}/", module_text,
                f"expected the page to point the learner at its own package "
                f"exercises/{manifest['id']}/; check the Exercise section, since a page with no "
                f"link leaves the graded package unreachable from the lesson",
            )

    def test_the_report_covers_every_package(self):
        """A report is only evidence if it names every package on disk.

        Without this, a stale or one-package report from `$RUN_EXERCISE_REPORT` would satisfy the
        checks below while 47 packages went unchecked.
        """
        on_disk = set()
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                on_disk.add(json.load(handle)["id"])
        reported = {report["id"] for report in self.reports}
        self.assertTrue(on_disk, "expected exercise manifests on disk; check exercises/*/exercise.json")
        self.assertEqual(
            reported, on_disk,
            f"expected {self.source} to cover every package; unreported: "
            f"{sorted(on_disk - reported)}, reported but not on disk: "
            f"{sorted(reported - on_disk)} - a partial report would let the checks below pass "
            f"while those packages went unverified",
        )

    def test_three_way_check_passes(self):
        proc = self.three_way
        self.assertTrue(
            self.reports or (proc is not None and proc.returncode == 0),
            f"expected scripts/run_exercise.py --json to print one report per package; got no "
            f"JSON at all, so the script itself failed to start - stderr: "
            f"{proc.stderr[-2000:] if proc else 'read from $RUN_EXERCISE_REPORT instead'}",
        )
        failed = [report for report in self.reports if not report["ok"]]
        detail = "\n".join(
            "%s: %s" % (report["id"], "; ".join("%s (%s)" % (check["name"], check["detail"])
                                                 for check in report["checks"] if not check["ok"]))
            for report in failed
        )
        self.assertEqual(
            failed, [],
            f"expected every package's starter/solution/fault/cheat/workbench checks to pass; "
            f"{len(failed)} package(s) failed in {self.source} - check each suite against its "
            f"solution.py:\n{detail}",
        )
        if proc is not None:
            self.assertEqual(
                proc.returncode, 0,
                f"expected scripts/run_exercise.py to exit 0 when every report says ok; got "
                f"exit {proc.returncode} - a nonzero exit with no failed report means the script "
                f"crashed or a package was skipped",
            )

    def test_a_report_file_is_believed_only_when_it_says_pass(self):
        """The `$RUN_EXERCISE_REPORT` shortcut must not be a way to skip the checks.

        A doctored report with one failed check has to fail this suite, from the report alone.
        """
        with tempfile.TemporaryDirectory() as scratch:
            report_path = os.path.join(scratch, "report.json")
            reports = json.loads(json.dumps(self.reports)) if self.reports else []
            if not reports:
                self.skipTest("no report to doctor - run_exercise.py produced no packages")
            reports[0]["ok"] = False
            reports[0]["checks"][0]["ok"] = False
            reports[0]["checks"][0]["detail"] = "doctored: this check did not pass"
            with open(report_path, "w", encoding="utf-8") as handle:
                json.dump(reports, handle)
            proc = subprocess.run(
                [sys.executable, os.path.join(ROOT, "tests", "test_exercise_package.py"),
                 "PackageContract.test_three_way_check_passes"],
                cwd=ROOT, capture_output=True, text=True,
                env=dict(os.environ, RUN_EXERCISE_REPORT=report_path),
            )
        self.assertEqual(
            proc.returncode, 1,
            f"expected a doctored report to fail the three-way check; it exited "
            f"{proc.returncode} - a report file that is trusted blindly would let CI pass on "
            f"stale or edited verdicts. Output:\n{proc.stdout[-1500:]}{proc.stderr[-500:]}",
        )
        self.assertIn(
            reports[0]["id"], proc.stdout + proc.stderr,
            f"expected the failure to name the package whose report says it failed "
            f"({reports[0]['id']}); got:\n{proc.stdout[-1500:]}{proc.stderr[-500:]}",
        )

    def test_workbench_entry_matches_the_package(self):
        data_path = os.path.join(ROOT, "app", "src", "data", "pythonLessonsData.ts")
        self.assertTrue(
            os.path.isfile(data_path),
            f"expected the generated {data_path}; check it exists by running "
            f"scripts/generate_python_lessons_data.py, which the build's prebuild step also runs",
        )
        with open(data_path, "r", encoding="utf-8") as handle:
            generated = handle.read()
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
            entry_id = manifest["delivery"]["workbench_id"]
            self.assertIn(
                f'"id": "{entry_id}"', generated,
                f"expected the workbench data to carry an entry with id {entry_id!r}; check "
                f"the manifest's delivery.workbench_id against the regenerated file",
            )
            expected = exercise_bundle.expected_output(directory, root=ROOT)
            self.assertIn(
                expected, generated,
                f"expected the generated Expected Output for {entry_id} to be the self-check's "
                f"own PASS line, {expected!r}; check the data file was regenerated after the "
                f"self-check changed, or the browser grades stdout against the old line",
            )

    def test_instructor_tests_come_from_the_package_not_the_editor(self):
        """The workbench grades with a copy of `selfcheck.py` read at build time, not the editor one.

        The appended copy is visible and learner-editable on purpose. If the entry carried a comment
        there instead, the browser's instructor check would pass for any submission that executed,
        and a program that merely printed the expected PASS line would be verified.
        """
        entries = {entry["id"]: entry for entry in generate_python_lessons_data.exercise_lessons()}
        self.assertTrue(
            entries,
            "expected generate_python_lessons_data.exercise_lessons() to yield one entry per "
            "package; got none - check that the generator still walks exercises/*/exercise.json",
        )
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
            entry = entries[manifest["delivery"]["workbench_id"]]
            source = exercise_bundle.selfcheck_source(directory)
            self.assertEqual(
                entry["instructorTests"], source,
                f"expected {manifest['id']}'s instructorTests to be its selfcheck.py verbatim; "
                f"check the generator copies the file rather than a comment standing in for it",
            )
            self.assertIn(
                "assert ", source,
                f"expected {manifest['id']}'s selfcheck.py to assert something; a self-check "
                f"with no assertion cannot fail, so it grades every submission as correct",
            )
            self.assertFalse(
                source.lstrip().startswith("#"),
                f"expected {manifest['id']}'s instructorTests to be executable tests; a comment "
                f"passes for any submission that executes - check the generator's source read",
            )

    def test_print_only_submission_fails_the_instructor_tests(self):
        """A submission that only prints the expected PASS line must not pass the grader.

        This mirrors the workbench: the learner namespace is empty apart from the source string, so
        a print-only program exposes none of the functions `selfcheck.py` asserts on. The browser
        regression is `scripts/e2e_browser_workbench.mjs` step 2b.
        """
        spoof = 'print("SELF-CHECK PASS: spoofed")\n'
        for directory in packages():
            source = exercise_bundle.selfcheck_source(directory)
            namespace = {"__name__": "__main__", "__mechalab_student_source__": spoof}
            with self.assertRaises(Exception, msg=os.path.basename(directory)):
                exec(compile(source, "<instructor_tests>", "exec"), namespace)

    def test_workbench_starter_fails_and_solution_passes(self):
        """Read from the run's report: the flattened browser program is executed there, for both
        the starter and the solution of every package, which is exactly what this check needs."""
        self.assertTrue(
            self.checks,
            f"expected a report per package from {self.source}; got none, so the browser-entry "
            f"verdicts below cannot be read - check the report file is this run's, or that "
            f"scripts/run_exercise.py --json still prints one entry per package",
        )
        for module_id in sorted(self.checks):
            checks = self.checks[module_id]
            for name, explanation in (
                ("workbench entry passes",
                 "the workbench grades this same flattened program, so a failure here is a failure "
                 "a learner would meet - check the package's solution.py and its selfcheck.py"),
                ("workbench entry starter fails",
                 "a starter that passes its own self-check means the holes were already filled, "
                 "or the appended self-check never ran"),
            ):
                with self.subTest(module=module_id, check=name):
                    self.assertIn(
                        name, checks,
                        f"expected {module_id}'s report to carry the check named '{name}'; "
                        f"{explanation}",
                    )
                    self.assertTrue(
                        checks[name]["ok"],
                        f"expected {module_id} to pass '{name}', reported as "
                        f"{checks[name]['detail']!r}; {explanation}",
                    )


if __name__ == "__main__":
    unittest.main(verbosity=2)
