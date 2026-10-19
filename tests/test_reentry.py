#!/usr/bin/env python3
"""Guard `docs/REENTRY.md`: the page a learner opens after weeks away.

A return path can fail in ways a link checker cannot see:

1. **A task points nowhere** - its exit-check item or ramp lesson does not exist, so the miss it
   produces has no repair and the learner is sent to a page that is not there.
2. **A lesson stops being sampled** - between them the five tasks must touch all six ramp lessons.
   Drop the matrix half of task 3 and R.4 is never tested, which is invisible until someone returns
   cold and the tick is the thing they get wrong.
3. **An answer drifts** - the key is retyped prose, so a changed exit-check answer would leave two
   pages disagreeing. Every decimal in the key must appear in `docs/TIER1_EXIT_CHECK.md`.
4. **Nobody finds it** - the README, the ramp and the exit check all have to point here, because a
   returning learner arrives from the last page they finished, not from the docs folder.

Run: `python3 tests/test_reentry.py` (also wired into the CI verify step).
"""

import os
import re
import shlex
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "docs", "REENTRY.md")
CHECK = os.path.join(ROOT, "docs", "TIER1_EXIT_CHECK.md")
README = os.path.join(ROOT, "README.md")
RAMP_README = os.path.join(ROOT, "ramp", "README.md")

TASK_COUNT = 5
LESSON_RE = re.compile(r"R\.\d+")


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def ramp_lesson_ids():
    """Every `lesson_id: R.x` in ramp/, so a cited lesson is checked against the file set, not a list."""
    ids = set()
    ramp = os.path.join(ROOT, "ramp")
    for name in sorted(os.listdir(ramp)):
        if not re.match(r"R\.\d+.*\.md$", name):
            continue
        match = re.search(r"^lesson_id:\s*\"?(R\.\d+)\"?", read(os.path.join(ramp, name)), re.MULTILINE)
        if match:
            ids.add(match.group(1))
    return ids


def check_item_lessons(check_text):
    """`{item number: ramp lesson}` from the exit check's item table."""
    mapping = {}
    for line in check_text.splitlines():
        if not line.startswith("| "):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or not cells[0].isdigit() or len(cells) < 2:
            continue
        lesson = cells[-1]
        if LESSON_RE.fullmatch(lesson):
            mapping[int(cells[0])] = lesson
    return mapping


def parse_tasks(text):
    """The `# | Task | Ramp lesson | Exit item` rows of §1, in order."""
    tasks = []
    for line in text.splitlines():
        if not line.startswith("| "):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 4 or not cells[0].isdigit():
            continue
        number = int(cells[0])
        if number > TASK_COUNT and not tasks:
            continue
        tasks.append(
            {
                "number": number,
                "task": cells[1],
                "lessons": LESSON_RE.findall(cells[2]),
                "items": [int(n) for n in re.findall(r"\d+", cells[3])],
            }
        )
    return tasks


def answer_key(text):
    """`{task number: answer text}` from the `<details>` key, keyed by its numbered list."""
    start = text.find("<summary><strong>Answer key")
    if start == -1:
        return {}
    end = text.find("</details>", start)
    block = text[start:end]
    answers = {}
    for match in re.finditer(r"^(\d)\. (.+?)(?=^\d\. |\Z)", block, flags=re.MULTILINE | re.DOTALL):
        answers[int(match.group(1))] = match.group(2)
    return answers


def findings(text, check_text, lesson_ids=None, readme="", ramp_readme=""):
    """Every problem with one copy of the page; pure, so the negative test can feed it a doctored one."""
    lesson_ids = ramp_lesson_ids() if lesson_ids is None else lesson_ids
    mapping = check_item_lessons(check_text)
    problems = []

    tasks = parse_tasks(text)
    if len(tasks) != TASK_COUNT:
        problems.append(f"§1 has {len(tasks)} task rows, expected {TASK_COUNT}")
    if [task["number"] for task in tasks] != list(range(1, TASK_COUNT + 1)):
        problems.append(
            f"§1 task numbers are {[t['number'] for t in tasks]}, expected 1..{TASK_COUNT} in order"
        )

    cited = set()
    for task in tasks:
        label = f"task {task['number']}"
        if not task["lessons"]:
            problems.append(f"{label} cites no ramp lesson")
        if not task["items"]:
            problems.append(f"{label} cites no exit-check item")
        for lesson in task["lessons"]:
            cited.add(lesson)
            if lesson not in lesson_ids:
                problems.append(f"{label} cites `{lesson}`, which is not a ramp lesson ({sorted(lesson_ids)})")
        for item in task["items"]:
            if item not in mapping:
                problems.append(
                    f"{label} cites exit-check item {item}, which has no ramp lesson in docs/TIER1_EXIT_CHECK.md"
                )
            elif mapping[item] not in task["lessons"]:
                problems.append(
                    f"{label} cites item {item} (repaired by `{mapping[item]}`) but lists "
                    f"{task['lessons']} as its lessons"
                )

    missing = lesson_ids - cited
    if missing:
        problems.append(
            f"no task samples {sorted(missing)}: a returning learner never tests that operation"
        )

    answers = answer_key(text)
    if len(answers) != TASK_COUNT:
        problems.append(f"the answer key has {len(answers)} numbered answers, expected {TASK_COUNT}")
    for number, answer in sorted(answers.items()):
        numbers = re.findall(r"\d+\.\d+", answer)
        if not numbers:
            problems.append(f"answer {number} quotes no decimal number, so nothing ties it to the exit check")
        for number_text in numbers:
            if number_text not in check_text:
                problems.append(
                    f"answer {number} quotes `{number_text}`, which does not appear in "
                    "docs/TIER1_EXIT_CHECK.md: the key has drifted from the item it answers"
                )

    if "docs/REENTRY.md" not in readme:
        problems.append("README.md does not link docs/REENTRY.md, so nobody finds the return path")
    if "REENTRY.md" not in check_text:
        problems.append("docs/TIER1_EXIT_CHECK.md does not point a returning learner at REENTRY.md")
    if "REENTRY.md" not in ramp_readme:
        problems.append("ramp/README.md does not point a returning learner at ../docs/REENTRY.md")

    return problems


class ReentryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = read(DOC)
        cls.check_text = read(CHECK)
        cls.readme = read(README)
        cls.ramp_readme = read(RAMP_README)

    def check(self, text=None):
        return findings(
            self.doc if text is None else text,
            self.check_text,
            readme=self.readme,
            ramp_readme=self.ramp_readme,
        )

    def test_the_page_passes_its_own_checks(self):
        self.assertEqual(
            self.check(), [],
            f"expected docs/REENTRY.md to pass every check it documents about itself, got "
            f"{self.check()} - check the task table's item ids and lesson ids, which is what "
            f"the finder cross-checks",
        )

    def test_every_ramp_lesson_is_sampled(self):
        cited = set()
        for task in parse_tasks(self.doc):
            cited.update(task["lessons"])
        self.assertEqual(
            cited, ramp_lesson_ids(),
            f"expected the tasks to sample every ramp lesson exactly once; cited {sorted(cited)} "
            f"against {sorted(ramp_lesson_ids())} - a lesson nobody samples is one a returning "
            f"learner never revisits",
        )

    def test_a_task_pointing_at_a_missing_item_fails(self):
        doctored = re.sub(r"^(\| 1 \|.*\| )1( \|)$", r"\g<1>99\2", self.doc, count=1, flags=re.MULTILINE)
        self.assertNotEqual(
            doctored, self.doc,
            "expected the doctoring to change the table row; it matched nothing, so the negative "
            "path below would test an unmodified page - check the row's shape",
        )
        problems = self.check(doctored)
        self.assertTrue(
            any("item 99" in problem for problem in problems),
            f"expected a task citing item 99 to be reported as pointing at a missing item; got "
            f"{problems} - check the item-id lookup, which is what stops a dead pointer",
        )

    def test_a_task_citing_a_lesson_that_does_not_exist_fails(self):
        doctored = re.sub(r"^(\| 1 \|.*\| )R\.1( \| 1 \|)$", r"\g<1>R.9\2", self.doc, count=1, flags=re.MULTILINE)
        self.assertNotEqual(
            doctored, self.doc,
            "expected the doctoring to change the lesson id in row 1; it matched nothing, so "
            "the negative path below would test an unmodified page",
        )
        problems = self.check(doctored)
        self.assertTrue(
            any("R.9" in problem for problem in problems),
            f"expected a task citing R.9, which is not a ramp lesson, to be reported; got "
            f"{problems} - check the lesson-id set the finder compares against",
        )

    def test_a_dropped_task_leaves_a_lesson_unsampled(self):
        lines = [
            line
            for line in self.doc.splitlines()
            if not re.match(r"^\| 3 \|", line)
        ]
        problems = self.check("\n".join(lines))
        self.assertTrue(
            any("expected 5" in problem for problem in problems),
            f"expected dropping task row 3 to be reported as the wrong task count; got "
            f"{problems} - check the count check, since a lost row silently un-samples a lesson",
        )

    def test_the_documented_regrade_command_grades_one_package(self):
        """§4 tells a returning learner to re-grade one package; the command has to do exactly that."""
        commands = re.findall(r"`(python3 scripts/run_exercise\.py[^`]*)`", self.doc)
        self.assertEqual(len(commands), 1, f"expected one run_exercise command, found {commands}")
        self.assertIn(
            "--only", commands[0],
            f"expected the documented re-grade command to name one package with --only; "
            f"without it the command grades all 48 and a returning learner waits for the course, "
            f"which is not what section 4 promises",
        )
        proc = subprocess.run(
            shlex.split(commands[0]), cwd=ROOT, capture_output=True, text=True, timeout=300
        )
        self.assertEqual(
            proc.returncode, 0,
            f"expected the documented command {commands[0]!r} to exit 0 for the package it names; "
            f"a command a returning learner is told to run must work as printed - check the "
            f"package id and its suite:\n{proc.stdout}{proc.stderr}",
        )
        graded = [line for line in proc.stdout.splitlines() if line and not line.startswith(" ")]
        self.assertEqual(
            len(graded), 1,
            f"expected {commands[0]!r} to grade exactly one package and print one name; it "
            f"graded {graded} - check --only was parsed, since an ignored flag re-grades the "
            f"whole course",
        )

    def test_a_drifted_answer_fails(self):
        doctored = self.doc.replace("18.408 rad/s", "17.204 rad/s", 1)
        self.assertNotEqual(
            doctored, self.doc,
            "expected the doctoring to replace a quoted answer; it matched nothing, so the "
            "negative path below would test an unmodified page - check the answer's wording",
        )
        problems = self.check(doctored)
        self.assertTrue(
            any("17.204" in problem for problem in problems),
            f"an answer quoting a number the exit check does not contain was not reported: {problems}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
