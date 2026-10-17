#!/usr/bin/env python3
"""Build the browser program for an exercise package, and its expected output.

An exercise package is a directory of files, but the workbench runs one program in one Pyodide
filesystem, and grades it by comparing stdout. So the package is flattened on purpose, here, once:

    browser_program() = the learner's file (starter or solution) + `selfcheck.py` appended verbatim

The appended block is visible in the editor - that is the point. It is not a hidden grader; it is
the same `selfcheck.py` the repository keeps, and CI runs it against the starter (must fail) and the
solution (must pass) before the generated entry is allowed to claim anything.

Visible is not the same as trusted. The editor copy is learner-editable, so it cannot be the thing
that awards verification: `scripts/generate_python_lessons_data.py` also puts this source in the
entry's `instructorTests`, and the workbench runs *that* copy - read from disk at build time, in a
namespace the submission cannot rewrite - before a lesson counts as passed. Editing or deleting the
appended copy, or printing its `SELF-CHECK PASS:` line, changes the presentation check at most.

Both `scripts/generate_python_lessons_data.py` and `scripts/run_exercise.py` use this module, so the
browser entry and the CI check cannot drift into two different programs.
"""

import os
import subprocess
import sys

HEADER = "# --- browser self-check, appended by scripts/exercise_bundle.py; do not edit here ---\n"


def selfcheck_source(directory):
    """The package's instructor-owned self-check, read from disk rather than from the editor."""
    with open(os.path.join(directory, "selfcheck.py"), "r", encoding="utf-8") as handle:
        return handle.read()


def browser_program(directory, which="solution"):
    """The single-file program the workbench runs for `which` ('starter' or 'solution')."""
    path = os.path.join(directory, which + ".py")
    with open(path, "r", encoding="utf-8") as handle:
        learner_source = handle.read()
    return learner_source.rstrip() + "\n\n\n" + HEADER + selfcheck_source(directory)


def run_browser_program(directory, which="solution", root=None):
    """Execute the flattened program the way the workbench would; returns (ok, stdout)."""
    program = browser_program(directory, which)
    plant_dir = os.path.join(root or os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "resources", "plants")
    env = dict(os.environ)
    env["PYTHONPATH"] = plant_dir + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.run(
        [sys.executable, "-"],
        input=program,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
    )
    return proc.returncode == 0, proc.stdout


def expected_output(directory, root=None):
    """The stdout of the solution program, or a hard error - never a guessed string."""
    ok, output = run_browser_program(directory, "solution", root=root)
    if not ok:
        raise RuntimeError("exercise solution failed its own self-check:\n" + output)
    lines = [line for line in output.splitlines() if line.startswith("SELF-CHECK PASS:")]
    if len(lines) != 1:
        raise RuntimeError("self-check printed no single PASS line:\n" + output)
    return lines[0]
