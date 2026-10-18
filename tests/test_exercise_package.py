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
import unittest

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

    def test_three_way_check_passes(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "run_exercise.py")],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
        )
        self.assertEqual(
            proc.returncode, 0,
            f"expected every package's starter/solution/fault/cheat checks to pass, got exit "
            f"{proc.returncode}; the first failing package is named below - check its suite "
            f"against solution.py:\n{proc.stdout[-2000:]}",
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
        for directory in packages():
            ok, output = exercise_bundle.run_browser_program(directory, "solution", root=ROOT)
            self.assertTrue(
                ok and "SELF-CHECK PASS:" in output,
                f"expected the browser entry for {os.path.basename(directory)} to pass and print "
                f"its PASS line; the workbench grades this same program, so a failure here is a "
                f"failure a learner would meet:\n{output[-400:]}",
            )
            ok, output = exercise_bundle.run_browser_program(directory, "starter", root=ROOT)
            self.assertFalse(
                ok,
                f"expected the starter for {os.path.basename(directory)} to fail its own "
                f"self-check; a starter that passes means the holes were already filled",
            )
            self.assertIn(
                "NotImplementedError", output,
                f"expected the starter for {os.path.basename(directory)} to fail on a "
                f"NotImplementedError hole, not an import error - check PYTHONPATH and the "
                f"flattened entry, since only a TODO hole proves the package is unsolved",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
