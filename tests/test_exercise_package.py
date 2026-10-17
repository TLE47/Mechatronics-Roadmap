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
        self.assertTrue(packages(), "no exercise packages found")
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
            for name in ["starter.py", "solution.py", "selfcheck.py", "harness.py"]:
                self.assertTrue(os.path.isfile(os.path.join(directory, name)),
                                "%s is missing %s" % (manifest["id"], name))
            module_path = os.path.join(ROOT, manifest["module"])
            self.assertTrue(os.path.isfile(module_path), manifest["module"])
            with open(module_path, "r", encoding="utf-8") as handle:
                module_text = handle.read()
            self.assertIn("exercises/%s/" % manifest["id"], module_text,
                          "the module does not point the learner at its graded package")

    def test_three_way_check_passes(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "run_exercise.py")],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout)

    def test_workbench_entry_matches_the_package(self):
        data_path = os.path.join(ROOT, "app", "src", "data", "pythonLessonsData.ts")
        self.assertTrue(os.path.isfile(data_path), "run scripts/generate_python_lessons_data.py")
        with open(data_path, "r", encoding="utf-8") as handle:
            generated = handle.read()
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
            entry_id = manifest["delivery"]["workbench_id"]
            self.assertIn('"id": "%s"' % entry_id, generated)
            expected = exercise_bundle.expected_output(directory, root=ROOT)
            self.assertIn(expected, generated,
                          "the generated expected output is not the self-check's PASS line")

    def test_instructor_tests_come_from_the_package_not_the_editor(self):
        """The workbench grades with a copy of `selfcheck.py` read at build time, not the editor one.

        The appended copy is visible and learner-editable on purpose. If the entry carried a comment
        there instead, the browser's instructor check would pass for any submission that executed,
        and a program that merely printed the expected PASS line would be verified.
        """
        entries = {entry["id"]: entry for entry in generate_python_lessons_data.exercise_lessons()}
        self.assertTrue(entries, "no exercise entries were generated")
        for directory in packages():
            with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
            entry = entries[manifest["delivery"]["workbench_id"]]
            source = exercise_bundle.selfcheck_source(directory)
            self.assertEqual(entry["instructorTests"], source,
                             "%s: instructorTests is not the package's selfcheck.py" % manifest["id"])
            self.assertIn("assert ", source,
                          "%s: the self-check carries no assertion to grade with" % manifest["id"])
            self.assertFalse(source.lstrip().startswith("#"),
                             "%s: instructorTests is a comment, not executable tests" % manifest["id"])

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
            self.assertTrue(ok and "SELF-CHECK PASS:" in output, output[-400:])
            ok, output = exercise_bundle.run_browser_program(directory, "starter", root=ROOT)
            self.assertFalse(ok, "the starter must not pass its own self-check")
            self.assertIn("NotImplementedError", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
