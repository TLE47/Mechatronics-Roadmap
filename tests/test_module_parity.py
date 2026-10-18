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
        self.assertEqual(
            parity.difficulty_findings(SPEC_STYLE_FRONT_MATTER), [],
            f"expected the shape documented in docs/QUALITY_SPEC.md to parse clean; got "
            f"{parity.difficulty_findings(SPEC_STYLE_FRONT_MATTER)} - an author copying the "
            f"spec would now fail the gate",
        )

    def test_a_missing_block_is_still_a_finding(self):
        self.assertEqual(
            parity.difficulty_findings("id: x\ntitle: y\n"), ["no `difficulty:` block"],
            "expected a page with no difficulty block to be reported in those words; a page "
            "with no block has no step size and is exactly what the gate exists to catch",
        )

    def test_out_of_range_and_unknown_values_are_still_findings(self):
        broken = SPEC_STYLE_FRONT_MATTER.replace("math: 3", "math: 6").replace(
            "hardware_risk: low", "hardware_risk: extreme"
        )
        findings = parity.difficulty_findings(broken)
        self.assertIn(
            "`difficulty.math: 6` is outside 1..5", findings,
            f"expected an out-of-range math score to be reported by name and range; got "
            f"{findings} - the message is what tells an author which number to fix",
        )
        self.assertTrue(
            any("hardware_risk" in finding for finding in findings),
            f"expected the invented value 'extreme' to be reported under hardware_risk; got "
            f"{findings} - an unknown value must not pass as a score",
        )

    def test_a_boolean_where_a_value_belongs_is_not_read_as_a_number(self):
        broken = SPEC_STYLE_FRONT_MATTER.replace("coding: 3", "coding: high")
        self.assertIn(
            "`difficulty.coding:` is missing", parity.difficulty_findings(broken),
            f"expected a non-numeric value ('high') to read as missing rather than as a score; "
            f"got {parity.difficulty_findings(broken)} - a bool or word must never pass as 1..5",
        )


class TestSharedPlantItem(unittest.TestCase):
    def test_a_declaration_without_an_import_is_not_use(self):
        text = "```python\nimport math\nprint(1.0)\n```\n"
        self.assertEqual(
            parity.plant_decision("tier1_arm_motor", "", text), (False, "unhooked"),
            "expected a decline plus a runnable block that never imports the plant to count as "
            "unhooked; a Python block alone is not use",
        )

    def test_a_prose_mention_is_not_use(self):
        text = "Then the module runs `import mechalab_plant` in a sentence.\n"
        self.assertEqual(
            parity.plant_decision("tier1_arm_motor", "", text), (False, "unhooked"),
            "expected an import named in prose to count as unhooked; only a fenced python "
            "block runs, and counting prose would let a page claim an instrumented item it "
            "never executes",
        )

    def test_an_import_inside_a_python_block_is_use(self):
        text = "```python\nimport mechalab_plant as plant\nprint(plant.L1)\n```\n"
        self.assertEqual(
            parity.plant_decision("tier1_arm_motor", "", text), (True, "arm"),
            "expected an import inside a fenced python block to count as use of the shared "
            "plant, with the decision named 'arm'; a False here would fail every page that "
            "really does run the arm",
        )

    def test_none_needs_a_reason_of_its_own(self):
        self.assertEqual(
            parity.plant_decision("none", "", ""), (False, "unhooked"),
            "expected `plant: none` with no reason to be refused; otherwise every page can "
            "exempt itself by declaring none",
        )
        self.assertEqual(
            parity.plant_decision("none", "too short", ""), (False, "unhooked"),
            "expected a two-word reason to be refused just like an empty one; check the "
            "minimum length that makes an exemption checkable",
        )
        reason = "This module is about a KiCad file: there is no arm to run it on."
        self.assertEqual(
            parity.plant_decision("none", reason, ""), (True, "exempt"),
            f"expected a stated reason for `plant: none` to be accepted as an exemption; got "
            f"{parity.plant_decision('none', reason, '')} - the reason is the whole point of the field",
        )

    def test_a_missing_or_unknown_value_is_undeclared(self):
        self.assertEqual(
            parity.plant_decision("", "", ""), (False, "undeclared"),
            "expected a page with no `plant:` field to be reported as undeclared, distinct "
            "from unhooked, since the two need different repairs",
        )
        self.assertEqual(
            parity.plant_decision("tier2_quadruped", "", ""), (False, "undeclared"),
            "expected an unknown plant name to be undeclared rather than silently accepted; "
            "a typo in the field must not read as a declaration the module honours",
        )


class TestScoredItemsAndTheReferenceModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        status, rows, _, errors = parity.build()
        if status != 0:
            raise AssertionError("module_parity.build() failed: %s" % errors)
        cls.rows = rows

    def test_the_shared_plant_is_an_instrumented_item(self):
        self.assertIn(
            "executable:shared_plant", parity.instrumented_items(self.rows),
            f"expected executable:shared_plant to be one of the scored items; it is absent from "
            f"{parity.instrumented_items(self.rows)} - without it a page can claim the shared "
            f"plant without the item counting for or against it",
        )

    def test_the_reference_module_is_at_one_hundred_percent(self):
        """The module every later module copies, held to the whole contract."""
        row = next((item for item in self.rows if item["module"] == REFERENCE_MODULE), None)
        self.assertIsNotNone(
            row,
            f"expected the reference module {REFERENCE_MODULE} to be in the built rows; it is "
            f"missing from modules/ - check the page was not renamed without updating "
            f"REFERENCE_MODULE, since every later module copies it",
        )
        self.assertEqual(
            row["plant"], "arm",
            f"expected the reference module to run on the shared arm; got {row['plant']!r} - "
            f"the reference is the page that shows how to hook the plant up",
        )
        self.assertIn(
            row["verification"], parity.VERIFICATION_ROUTES,
            f"expected the reference module's verification route {row['verification']!r} to be "
            f"one of {parity.VERIFICATION_ROUTES}; an unlisted route is one nothing grades",
        )
        self.assertEqual(
            row["score"], 1.0,
            f"expected the reference module to score 1.0, the whole contract; it is missing "
            f"{parity.missing_items(row)} - check those items on the page",
        )

    def test_the_baseline_records_todays_item_set(self):
        with open(parity.BASELINE_PATH, encoding="utf-8") as handle:
            baseline = json.load(handle)
        self.assertEqual(
            baseline.get("instrumented_items"),
            parity.instrumented_items(self.rows),
            f"expected the recorded scored-item set to match today's; it moved, so check each "
            f"diff below and re-record the floor deliberately with "
            f"`python3 scripts/module_parity.py --update-baseline` only if the move is intended. "
            f"Recorded: {baseline.get('instrumented_items')}; now: "
            f"{parity.instrumented_items(self.rows)}",
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
        listed = "\n".join(findings)
        self.assertEqual(
            findings, [],
            f"expected every module with a graded package to open from a starter scaffold with "
            f"at least {MIN_TODOS} TODO holes and {MIN_HINTS} hints; check the page's section 5 "
            f"against the package's starter.py, which the learner is handed:\n{listed}",
        )

    def test_the_check_catches_a_stub_with_no_todos_or_hints(self):
        """The negative path: the words alone must not pass, or the test above is theatre."""
        words_only = scaffold_findings("### Full Solution\n```python\nprint('TODO')\n```\n")
        self.assertEqual(
            words_only, ["no `### Starter code`", "no `### Hint ladder`"],
            f"expected a page carrying only the words 'TODO' and 'Full Solution' to be refused "
            f"for both missing headings; got {words_only} - the headings are what make it a "
            f"scaffold rather than a solution with a comment",
        )
        # Headings present, but a one-`...` stub and a single hint: still not a scaffold.
        thin = scaffold_findings(
            "### Starter code\n```python\n# TODO: fill it in\ndef a():\n    ...\n\n"
            "def b():\n    ...\n\ndef c():\n    ...\n```\n"
            "### Hint ladder\n1. try the formula\n"
            "### Full Solution\n```python\nprint(1)\n```\n"
        )
        self.assertEqual(
            len(thin), 2,
            f"expected exactly two findings for a three-hole stub with one hint (too few "
            f"hints, too few TODOs); got {len(thin)}: {thin} - check MIN_TODOS and MIN_HINTS",
        )
        self.assertIn(
            "at least 3 expected", thin[0],
            f"expected the first finding to name the required count of TODOs; got {thin[0]!r} - "
            f"a message without the number leaves the author guessing",
        )


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
        # A hole is marked either way: `# TODO` in a page's own scaffold, or the
        # `raise NotImplementedError(...)` the package's `starter.py` ships (several pages carry that
        # file verbatim, so their scaffold has no `# TODO` line and is no less a scaffold).
        # The floor is the package's own hole count: every function the scaffold defines must be a
        # hole, which is at least `MIN_TODOS` for every package that ships that many functions.
        holes = len(re.findall(r"#\s*TODO|raise\s+NotImplementedError", starter))
        functions = len(re.findall(r"^def ", starter, re.M))
        expected = max(min(MIN_TODOS, functions), functions and 1 or 0)
        if holes < expected:
            findings.append("%d hole(s) for %d function(s) in the starter, at least %d expected"
                            % (holes, functions, expected))
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
        listed = "\n".join(findings)
        self.assertEqual(
            findings, [],
            f"expected every module's Gate answer key to run; the keys are what the learner's "
            f"answers are graded against, so one that raises grades nothing:\n{listed}",
        )


def _module_rows():
    status, rows, _, errors = parity.build()
    if status != 0:
        raise AssertionError("module_parity.build() failed: %s" % errors)
    return rows


def ladder_of(module: str) -> str:
    """The track-tier a module belongs to: the scope a Gate test must cover."""
    return ".".join(module.split(".")[:2])


def introduced_concepts(module: str) -> set[str]:
    """The `new_concepts:` and `owns:` lists from a module's own front matter.

    `owns:` names the legacy concepts the page re-teaches (mentions_audit's `own` verdict). They sit
    on the same ladder as a new concept - the Gate test must tag them - but they do not spend the
    page's three-`new_concepts` budget, because the page already teaches the material.
    """
    path = os.path.join(ROOT, "modules", module + ".md")
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    found: set[str] = set()
    for key in ("new_concepts", "owns"):
        block = re.search(r"^%s:\n((?:\s+- .+\n)+)" % key, text, re.MULTILINE)
        if block:
            found |= set(re.findall(r"^\s+-\s*(\S+)", block.group(1), re.MULTILINE))
    return found


class TestTier3CarriesBothLevels(unittest.TestCase):
    """A Tier 3 module is a supported-entry level and a derivation, not one article.

    `docs/SYLLABUS.md` splits Tier 3 into Level A (*Use & Understand*: what the method does, when to
    reach for it, how to check it is physically sane) and Level B (*Derive & Extend*: the derivation
    from first principles and one step past it). Parity scored the two headings; a heading with a
    sentence under it would pass that, so this pins the depth too - both sections carry real prose,
    and the derivation carries actual maths.
    """

    def test_every_tier3_module_has_both_levels(self):
        findings = []
        for row in _module_rows():
            if row["tier"] != 3:
                continue
            with open(os.path.join(ROOT, row["path"]), encoding="utf-8") as handle:
                findings += level_findings(handle.read(), row["module"])
        listed = "\n".join(findings)
        self.assertEqual(
            findings, [],
            f"expected every Tier 3 page's section 3 to carry both a Use & Understand and a "
            f"Derive & Extend level, each long enough and the second with maths; a two-level "
            f"contract with a prose derivation is not a level:\n{listed}",
        )

    def test_the_check_catches_stub_headings(self):
        """The negative path: two bare headings are not two levels."""
        stub = level_findings(
            "## 3. Formalization\n### Use & Understand\nRun it.\n"
            "### Derive & Extend\nDo the algebra.\n\n## 4. Worked example\n",
            "fixture.T3.99z",
        )
        self.assertEqual(
            len(stub), 2,
            f"expected exactly two findings for two headings with 3-4 words each; got "
            f"{len(stub)}: {stub} - check MIN_LEVEL_CHARS",
        )
        self.assertTrue(
            all("too thin" in finding for finding in stub),
            f"expected both findings to say 'too thin'; got {stub} - a heading with no content "
            f"must be reported as thin, not as something else",
        )
        # Long enough to pass the depth check, but prose where a derivation belongs.
        prose = "This paragraph is prose about the method and its assumptions. " * 8
        findings = level_findings(
            "### Use & Understand\n" + prose + "\n### Derive & Extend\n" + prose + "\n## 4. Worked example\n",
            "fixture.T3.99z",
        )
        self.assertEqual(
            findings, ["fixture.T3.99z: `### Derive & Extend` carries no maths"],
            f"expected long prose with no maths in Derive & Extend to be reported as carrying "
            f"no maths; got {findings} - length alone would accept a paragraph where a "
            f"derivation belongs",
        )


MIN_LEVEL_CHARS = 400


def level_findings(text: str, module: str) -> list[str]:
    """What a Tier 3 module's two levels are missing, as plain statements."""
    findings = []
    for heading in ("### Use & Understand", "### Derive & Extend"):
        body = _bounded_section(text, heading)
        if not body:
            findings.append("%s: no `%s`" % (module, heading))
        elif len(body.strip()) < MIN_LEVEL_CHARS:
            findings.append("%s: `%s` is too thin (%d chars, %d expected)"
                            % (module, heading, len(body.strip()), MIN_LEVEL_CHARS))
    derive = _bounded_section(text, "### Derive & Extend")
    if derive and len(derive.strip()) >= MIN_LEVEL_CHARS and not re.search(r"\$[^$\n]+\$", derive):
        findings.append("%s: `### Derive & Extend` carries no maths" % module)
    return findings


def _bounded_section(text: str, heading: str) -> str:
    """The body under an H3 heading, ending at the next H2 or H3."""
    match = re.search(re.escape(heading) + r"\n(.*?)(?=\n##+ |\Z)", text, re.DOTALL)
    return match.group(1) if match else ""


class TestNoModuleLeavesThePlantUndecided(unittest.TestCase):
    """`plant:` is the one scored item that is not optional-by-omission.

    A module either runs on the shared arm - `plant: tier1_arm_motor` with a real
    `import mechalab_plant` inside one of its python blocks, so the exercise is provably on the same
    arm every other exercise uses - or it says, in `plant_note:`, why it does not. Silence scores
    zero in parity and is invisible in a diff, so this names every module that is still silent.
    """

    def test_every_bridge_module_settles_the_plant_question(self):
        undecided = [row["module"] for row in _module_rows() if row["plant"] in ("undeclared", "unhooked")]
        self.assertEqual(
            undecided, [],
            f"expected every module to settle the plant question - either run the shared arm "
            f"from a fenced python block or state why there is nothing to run; these "
            f"{len(undecided)} are still silent: {', '.join(undecided)}",
        )

    def test_the_two_honest_answers_are_the_only_ones_scored(self):
        """The negative path: a declaration with no import, and a `none` with no reason."""
        self.assertEqual(
            parity.plant_decision("tier1_arm_motor", "", "plant: tier1_arm_motor"),
            (False, "unhooked"),
            "expected a front-matter declaration with no import to count as unhooked; a page "
            "that names the plant in its own metadata is exactly the case this checks",
        )
        self.assertEqual(
            parity.plant_decision("none", "too short", "plant: none"),
            (False, "unhooked"),
            "expected `plant: none` with a two-word reason to be refused; the reason is what "
            "makes the exemption reviewable",
        )
        self.assertEqual(
            parity.plant_decision("tier1_arm_motor", "",
                                  "```python\nimport mechalab_plant\n```"),
            (True, "arm"),
            "expected the honest case - declare the arm and import it in a python block - to be "
            "scored as use; a False here would make the gate impossible to satisfy",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
