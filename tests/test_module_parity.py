#!/usr/bin/env python3
"""Regression tests for the tier-parity scorer, `scripts/module_parity.py`.

Three jobs:

1. **The spec's own metadata example must pass the parser.** `docs/QUALITY_SPEC.md` §2 writes its
   `difficulty:` block with a trailing `# comment` on each value, which is ordinary YAML. The parser
   required the line to end at the number, so a module written to the spec failed the Structure
   layer - dogfooding the reference module is how it surfaced. Both halves are asserted here so the
   fix cannot become a silent loosening: the commented form is accepted, and out-of-range values,
   unknown enum values and a missing block are still findings.
2. **The shared-plant item keeps its teeth.** `plant: tier1_arm_motor` scores only with a real
   `import mechalab_plant` inside a python block; `plant: none` only with a reason of its own.
3. **The reference module stays the reference.** `02-mechanics.T2.02a` is the module every later one
   copies, so its published score is asserted at 100% and the baseline's recorded item set is
   asserted to be today's - a newly instrumented item must be a deliberate re-record, not a silent
   drop.
4. **The learner scaffold is a scaffold, not a word.** Parity scores `learner_exercise_scaffold` on
   a `TODO` and the two words "Full Solution" anywhere in §5. This pins the shape the reference
   module publishes, for every module that ships a package: a `### Starter code` block with at least
   three `...`-bodied TODOs, a `### Hint ladder` with at least three numbered hints, and a
   `### Full Solution` block.

Run: `python3 tests/test_module_parity.py` (also wired into the CI verify step).
"""

import contextlib
import io
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "resources", "plants"))

import module_parity as parity  # noqa: E402  (path set up above)

REFERENCE_MODULE = "02-mechanics.T2.02a"

# `docs/QUALITY_SPEC.md` §2, verbatim in style: a trailing comment after every value.
SPEC_STYLE_FRONT_MATTER = """id: 02-mechanics.T2.99z
title: "A metadata block written the way docs/QUALITY_SPEC.md writes one"
track: "02"
tier: 2
difficulty:
  math: 3           # 1..5 - new mathematical objects this module introduces
  coding: 3         # 1..5 - new code/SDK surface
  tools: 2          # 0..5 - new tools (0 = none)
  hardware_risk: low    # low | medium | high
  simulation: full      # full | partial | none
verification: browser
plant: tier1_arm_motor
"""


class TestDifficultyLabel(unittest.TestCase):
    def test_the_specs_own_example_parses(self):
        self.assertEqual(parity.difficulty_findings(SPEC_STYLE_FRONT_MATTER), [])

    def test_a_missing_block_is_still_a_finding(self):
        self.assertEqual(parity.difficulty_findings("id: x\ntitle: y\n"), ["no `difficulty:` block"])

    def test_out_of_range_and_unknown_values_are_still_findings(self):
        broken = SPEC_STYLE_FRONT_MATTER.replace("math: 3", "math: 6").replace(
            "hardware_risk: low", "hardware_risk: extreme"
        )
        findings = parity.difficulty_findings(broken)
        self.assertIn("`difficulty.math: 6` is outside 1..5", findings)
        self.assertTrue(any("hardware_risk" in finding for finding in findings), findings)

    def test_a_boolean_where_a_value_belongs_is_not_read_as_a_number(self):
        broken = SPEC_STYLE_FRONT_MATTER.replace("coding: 3", "coding: high")
        self.assertIn("`difficulty.coding:` is missing", parity.difficulty_findings(broken))


class TestSharedPlantItem(unittest.TestCase):
    def test_a_declaration_without_an_import_is_not_use(self):
        text = "```python\nimport math\nprint(1.0)\n```\n"
        self.assertEqual(parity.plant_decision("tier1_arm_motor", "", text), (False, "unhooked"))

    def test_a_prose_mention_is_not_use(self):
        text = "Then the module runs `import mechalab_plant` in a sentence.\n"
        self.assertEqual(parity.plant_decision("tier1_arm_motor", "", text), (False, "unhooked"))

    def test_an_import_inside_a_python_block_is_use(self):
        text = "```python\nimport mechalab_plant as plant\nprint(plant.L1)\n```\n"
        self.assertEqual(parity.plant_decision("tier1_arm_motor", "", text), (True, "arm"))

    def test_none_needs_a_reason_of_its_own(self):
        self.assertEqual(parity.plant_decision("none", "", ""), (False, "unhooked"))
        self.assertEqual(parity.plant_decision("none", "too short", ""), (False, "unhooked"))
        reason = "This module is about a KiCad file: there is no arm to run it on."
        self.assertEqual(parity.plant_decision("none", reason, ""), (True, "exempt"))

    def test_a_missing_or_unknown_value_is_undeclared(self):
        self.assertEqual(parity.plant_decision("", "", ""), (False, "undeclared"))
        self.assertEqual(parity.plant_decision("tier2_quadruped", "", ""), (False, "undeclared"))


class TestScoredItemsAndTheReferenceModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        status, rows, _, errors = parity.build()
        if status != 0:
            raise AssertionError("module_parity.build() failed: %s" % errors)
        cls.rows = rows

    def test_the_shared_plant_is_an_instrumented_item(self):
        self.assertIn("executable:shared_plant", parity.instrumented_items(self.rows))

    def test_the_reference_module_is_at_one_hundred_percent(self):
        """The module every later module copies, held to the whole contract."""
        row = next((item for item in self.rows if item["module"] == REFERENCE_MODULE), None)
        self.assertIsNotNone(row, "%s is missing from modules/" % REFERENCE_MODULE)
        self.assertEqual(row["plant"], "arm", "the reference module must run on the shared plant")
        self.assertIn(row["verification"], parity.VERIFICATION_ROUTES)
        self.assertEqual(row["score"], 1.0, "missing: %s" % parity.missing_items(row))

    def test_the_baseline_records_todays_item_set(self):
        with open(parity.BASELINE_PATH, encoding="utf-8") as handle:
            baseline = json.load(handle)
        self.assertEqual(
            baseline.get("instrumented_items"),
            parity.instrumented_items(self.rows),
            "the scored item set moved - re-record the floor deliberately with --update-baseline",
        )


class TestTheLearnerScaffoldIsARealOne(unittest.TestCase):
    """Every module with a graded package must open from a scaffold a beginner can start.

    `learner_exercise_scaffold` scores a `TODO` plus the words "Full Solution" anywhere in §5, which
    a two-line stub satisfies without teaching anything. The reference module's shape - `### Starter
    code` with `...` bodies, a `### Hint ladder` of numbered hints, then `### Full Solution` - is the
    contract here, checked for every module rather than asserted one module at a time.
    """

    @classmethod
    def setUpClass(cls):
        status, rows, _, errors = parity.build()
        if status != 0:
            raise AssertionError("module_parity.build() failed: %s" % errors)
        cls.rows = rows

    def test_every_bridge_module_opens_from_a_scaffold(self):
        findings = []
        for row in self.rows:
            with open(os.path.join(ROOT, row["path"]), encoding="utf-8") as handle:
                exercise = parity.section_bodies(handle.read()).get(5, "")
            findings += ["%s: %s" % (row["module"], finding)
                         for finding in scaffold_findings(exercise)]
        self.assertEqual(findings, [], "\n".join(findings))

    def test_the_check_catches_a_stub_with_no_todos_or_hints(self):
        """The negative path: the words alone must not pass, or the test above is theatre."""
        words_only = scaffold_findings("### Full Solution\n```python\nprint('TODO')\n```\n")
        self.assertEqual(words_only, ["no `### Starter code`", "no `### Hint ladder`"])
        # Headings present, but a one-`...` stub and a single hint: still not a scaffold.
        thin = scaffold_findings(
            "### Starter code\n```python\n# TODO: fill it in\n...\n```\n"
            "### Hint ladder\n1. try the formula\n"
            "### Full Solution\n```python\nprint(1)\n```\n"
        )
        self.assertEqual(len(thin), 2, thin)
        self.assertIn("at least 3 expected", thin[0])


SCAFFOLD_SECTIONS = ("### Starter code", "### Hint ladder", "### Full Solution")
MIN_TODOS = 3
MIN_HINTS = 3


def scaffold_findings(exercise: str) -> list[str]:
    """What §5 is missing before its scaffold can be handed to a learner, as plain statements."""
    findings = []
    for heading in SCAFFOLD_SECTIONS:
        if heading not in exercise:
            findings.append("no `%s`" % heading)
    starter = _section(exercise, "### Starter code")
    full = _section(exercise, "### Full Solution")
    hints = _section(exercise, "### Hint ladder")
    if starter:
        todos = len(re.findall(r"#\s*TODO", starter))
        if todos < MIN_TODOS:
            findings.append("%d TODO(s) in the starter, at least %d expected" % (todos, MIN_TODOS))
    if full and "```python" not in full:
        findings.append("the full solution carries no python block")
    if hints and len(re.findall(r"^\d+\.\s", hints, flags=re.MULTILINE)) < MIN_HINTS:
        findings.append("fewer than %d numbered hints" % MIN_HINTS)
    return findings


def _section(text: str, heading: str) -> str:
    start = text.find(heading)
    if start < 0:
        return ""
    end = text.find("\n### ", start + len(heading))
    return text[start : end if end >= 0 else len(text)]


class TestEveryBridgeModuleClosesItsLadder(unittest.TestCase):
    """Each module's Gate test is the experiment for its whole track-tier ladder.

    `scripts/validate_modules.py` checks the tags of a Gate test that exists, so a module with no
    Gate test passes that check by carrying nothing. This turns the parity item `checkpoint_tests`
    into a guarantee: every bridge module publishes a `### Gate test`, it tags exactly the concepts
    its ladder introduces - no gap and no straggler - and its answer key runs to the last assert.
    """

    def test_every_module_has_a_gate_that_covers_its_ladder(self):
        findings = []
        ladders = {}
        for row in _module_rows():
            module = row["module"]
            ladders.setdefault(ladder_of(module), set()).update(introduced_concepts(module))
        for row in _module_rows():
            module = row["module"]
            with open(os.path.join(ROOT, row["path"]), encoding="utf-8") as handle:
                started = re.search(r"### Gate test(.*?)(?=\n## |\Z)", handle.read(), re.DOTALL)
            gate = started.group(1) if started else ""
            if not gate:
                findings.append("%s: no `### Gate test`" % module)
                continue
            tagged = set(re.findall(r"\[Concept:\s*([^\]]+)\]", gate))
            expected = ladders[ladder_of(module)]
            findings += ["%s: Gate test misses `%s`" % (module, c) for c in sorted(expected - tagged)]
            findings += ["%s: Gate test tags unknown `%s`" % (module, c) for c in sorted(tagged - expected)]
            key = re.search(r"```python\n(.*?)```", gate, re.DOTALL)
            if not key:
                findings.append("%s: Gate test has no answer-key python block" % module)
                continue
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    exec(key.group(1), {})
            except Exception as exc:  # noqa: BLE001 - the point is to name the module that breaks
                findings.append("%s: Gate answer key raised %r" % (module, exc))
        self.assertEqual(findings, [], "\n".join(findings))


def _module_rows():
    status, rows, _, errors = parity.build()
    if status != 0:
        raise AssertionError("module_parity.build() failed: %s" % errors)
    return rows


def ladder_of(module: str) -> str:
    """The track-tier a module belongs to: the scope a Gate test must cover."""
    return ".".join(module.split(".")[:2])


def introduced_concepts(module: str) -> set[str]:
    """The `new_concepts:` list from a module's own front matter."""
    path = os.path.join(ROOT, "modules", module + ".md")
    with open(path, encoding="utf-8") as handle:
        block = re.search(r"^new_concepts:\n((?:\s+- .+\n)+)", handle.read(), re.MULTILINE)
    return set(re.findall(r"^\s+-\s*(\S+)", block.group(1), re.MULTILINE)) if block else set()


if __name__ == "__main__":
    unittest.main(verbosity=2)
