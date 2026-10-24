#!/usr/bin/env python3
"""The plan-rows gate's reading is itself a contract (`tests/test_plan_rows.py`).

`scripts/check_plan_rows.py` promises that a row which reopens the 2.0 plan, or claims `ships` without
naming something a reader can run, fails the build. Each of those promises is a rule about Markdown, and
a rule that has only ever seen a correct page is untested: an emphasis mark it failed to strip, a fenced
table it read as live, a script name it matched inside a longer word would all read as a pass. So the
rules are pinned on small plans written here, and then the repository itself — because a gate that is
green only on synthetic input has not been run.

Run: `python3 tests/test_plan_rows.py` (also discovered by `python3 -m unittest discover -s tests`).
"""

import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_plan_rows  # noqa: E402

SCRIPTS = {"test:scope", "test:runtime", "check:weight", "dev"}
STEPS = {"5a", "7g-i"}


def repository(scripts=SCRIPTS, steps=STEPS, facts=None):
    """A throwaway tree with the `package.json` and `scripts/e2e_*.mjs` the gate reads."""
    temporary = tempfile.TemporaryDirectory()
    root = temporary.name
    os.makedirs(os.path.join(root, "scripts"))
    os.makedirs(os.path.join(root, "tests"))
    os.makedirs(os.path.join(root, "docs"))
    os.makedirs(os.path.join(root, "app"))
    with open(os.path.join(root, "package.json"), "w", encoding="utf-8") as handle:
        json.dump({"scripts": {name: "node x.mjs" for name in scripts}}, handle)
    with open(os.path.join(root, "scripts", "e2e_toy.mjs"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(f"    // {step}. a step" for step in sorted(steps)))
    # The runtime suite numbers its checks in comments; the page cites them by that number.
    with open(os.path.join(root, "scripts", "e2e_runtime.mjs"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(f"    // {n}. a runtime check" for n in (14, 15, 16)))
    for path in ("scripts/real_gate.py", "tests/test_real_gate.py"):
        with open(os.path.join(root, path), "w", encoding="utf-8") as handle:
            handle.write("# a file the plan may cite\n")
    if facts is not None:
        with open(os.path.join(root, "docs", "plan-facts.json"), "w", encoding="utf-8") as handle:
            json.dump({"facts": facts}, handle)
    return temporary, root


def plan(*rows):
    """A table with the plan's own header, one `(item, reality, verdict)` row per argument."""
    lines = ["# A plan", "", "| Plan | Reality | Verdict |", "| :--- | :--- | :--- |"]
    lines.extend(f"| {item} | {reality} | {verdict} |" for item, reality, verdict in rows)
    return "\n".join(lines) + "\n"


class PlanRowRules(unittest.TestCase):
    def setUp(self):
        self.temporary, self.root = repository()
        self.addCleanup(self.temporary.cleanup)

    def findings(self, text, minimum=1):
        found, _read = check_plan_rows.check(text, self.root, minimum=minimum)
        return found

    def whys(self, text, minimum=1):
        return " ".join(finding["why"] for finding in self.findings(text, minimum))

    def test_a_closed_row_backed_by_a_script_passes(self):
        text = plan(("Scope", "drawn on a canvas (`npm run test:scope`)", "**ships**"))
        self.assertEqual(
            self.findings(text),
            [],
            msg=f"expected an emphasised `ships` naming a real script to pass; got {self.findings(text)}"
            " — check that `plain` strips the emphasis and the npm lookup reads package.json",
        )

    def test_a_reopened_row_is_a_finding(self):
        for verdict in ("partial", "missing"):
            text = plan(("Scope", "half of it (`npm run test:scope`)", f"**{verdict}**"))
            found = self.findings(text)
            self.assertEqual(
                len(found),
                1,
                msg=f"expected exactly one finding for a `{verdict}` row; got {found}",
            )
            self.assertIn(
                "closed",
                found[0]["why"],
                msg=f"expected the finding to say the plan is closed; got {found[0]['why']}",
            )

    def test_a_verdict_outside_the_vocabulary_is_a_finding(self):
        text = plan(("Scope", "it works (`npm run test:scope`)", "shipped-ish"))
        found = self.findings(text)
        self.assertEqual(
            len(found),
            1,
            msg=f"expected one finding for an invented verdict; got {found}",
        )
        self.assertIn(
            "'shipped-ish'",
            found[0]["why"],
            msg=f"expected the finding to quote the word it refused; got {found[0]['why']}",
        )

    def test_a_ships_row_with_nothing_to_run_is_a_finding(self):
        text = plan(("Scope", "drawn on a canvas, honest", "**ships**"))
        found = self.findings(text)
        self.assertEqual(
            len(found),
            1,
            msg=f"expected one finding for a claim with no command; got {found}",
        )
        self.assertIn(
            "run",
            found[0]["why"],
            msg=f"expected the finding to ask for something runnable; got {found[0]['why']}",
        )

    def test_a_script_that_is_not_in_package_json_is_a_finding(self):
        text = plan(("Scope", "drawn on a canvas (`npm run test:zoop`)", "**ships**"))
        self.assertIn(
            "test:zoop",
            self.whys(text),
            msg="expected the finding to name the missing script, not just the row",
        )

    def test_a_file_that_is_not_on_disk_is_a_finding(self):
        text = plan(
            ("Scope", "gated by `scripts/no_such_gate.py`", "**ships**"),
            ("Checks", "gated by `scripts/real_gate.py`", "**ships**"),
        )
        found = self.findings(text)
        self.assertEqual(
            len(found),
            1,
            msg=f"expected only the absent path to be reported; got {found} — check that a real file passes",
        )
        self.assertIn(
            "scripts/no_such_gate.py",
            found[0]["why"],
            msg=f"expected the finding to name the missing path; got {found[0]['why']}",
        )

    def test_a_runtime_check_the_suite_does_not_number_is_a_finding(self):
        text = plan(
            ("Debugger", "a parked frame, edited (`npm run test:runtime`, checks 14)", "**ships**"),
            ("Breakpoints", "a condition (`npm run test:runtime`, checks 15–16)", "**ships**"),
            ("Watches", "a pinned expression (`npm run test:runtime`, checks 99)", "**ships**"),
        )
        found = self.findings(text)
        self.assertEqual(
            len(found),
            1,
            msg=f"expected only the invented check number to be reported; got {found}",
        )
        self.assertIn(
            "checks 99",
            found[0]["why"],
            msg=f"expected the finding to name the check and its suite; got {found[0]['why']}",
        )

    def test_a_browser_step_no_suite_numbers_is_a_finding(self):
        text = plan(
            ("Scope", "browser step 7g-i", "**ships**"),
            ("Checks", "browser step 9z", "**ships**"),
        )
        found = self.findings(text)
        self.assertEqual(
            len(found),
            1,
            msg=f"expected only the invented step to be reported; got {found}",
        )
        self.assertIn(
            "9z",
            found[0]["why"],
            msg=f"expected the finding to name the step; got {found[0]['why']}",
        )

    def test_two_rows_for_one_item_are_a_finding(self):
        text = plan(
            ("Scope", "drawn on a canvas (`npm run test:scope`)", "**ships**"),
            ("Scope", "still drawn (`npm run test:scope`)", "**ships**"),
        )
        self.assertIn(
            "second row",
            self.whys(text),
            msg="expected a repeated plan item to be reported as a contradiction, not counted twice",
        )

    def test_a_row_missing_its_verdict_cell_is_a_finding(self):
        text = "# A plan\n\n| Plan | Reality | Verdict |\n| :--- | :--- | :--- |\n| Scope | trimmed short |\n"
        self.assertIn(
            "verdict column",
            self.whys(text),
            msg="expected a truncated row to be reported as a reading failure, not skipped",
        )

    def test_a_fenced_table_is_not_read(self):
        text = plan(("Scope", "drawn on a canvas (`npm run test:scope`)", "**ships**")) + (
            "\n```\n| Plan | Reality | Verdict |\n| :--- | :--- | :--- |\n"
            "| Old | still missing | **missing** |\n```\n"
        )
        self.assertEqual(
            self.findings(text),
            [],
            msg=f"expected the example table in a fence to be ignored; got {self.findings(text)}",
        )

    def test_a_page_with_no_verdict_table_is_a_finding(self):
        found = self.findings("# A plan\n\nno table here\n")
        self.assertEqual(
            len(found),
            1,
            msg=f"expected one finding for a page with no verdict column; got {found}",
        )
        self.assertIn(
            "Verdict",
            found[0]["why"],
            msg=f"expected the finding to name the missing column; got {found[0]['why']}",
        )

    def test_a_short_read_is_a_finding(self):
        text = plan(("Scope", "drawn on a canvas (`npm run test:scope`)", "**ships**"))
        found, read = check_plan_rows.check(text, self.root, minimum=15)
        self.assertEqual(read, 1, msg=f"expected the one row to be counted; got {read}")
        self.assertIn(
            "floor",
            " ".join(finding["why"] for finding in found),
            msg="expected a table that shrank below the floor to fail rather than read as empty",
        )

    def facts(self, facts, text):
        temporary, root = repository(facts=facts)
        self.addCleanup(temporary.cleanup)
        with open(os.path.join(root, "app", "tabs.json"), "w", encoding="utf-8") as handle:
            json.dump({"tabs": ["one", "two", "three"]}, handle)
        found, _read = check_plan_rows.check(text, root, minimum=1)
        return found

    def test_a_marked_number_must_match_the_file_it_names(self):
        fact = {"tabs": {"kind": "json_count", "path": "app/tabs.json", "pointer": "tabs"}}
        right = plan(("Scope", "three tabs (`npm run test:scope`) 3<!-- plan-fact:tabs -->", "**ships**"))
        self.assertEqual(
            self.facts(fact, right),
            [],
            msg=f"expected a marker equal to the file's count to pass; got {self.facts(fact, right)}",
        )
        stale = plan(("Scope", "four tabs (`npm run test:scope`) 4<!-- plan-fact:tabs -->", "**ships**"))
        found = self.facts(fact, stale)
        self.assertEqual(
            len(found),
            1,
            msg=f"expected one finding for a number the file contradicts; got {found}",
        )
        self.assertIn(
            "3",
            found[0]["why"],
            msg=f"expected the finding to say what the repository has (3); got {found[0]['why']}",
        )

    def test_a_marker_naming_no_fact_is_a_finding(self):
        found = self.facts(
            {},
            plan(("Scope", "three tabs (`npm run test:scope`) 3<!-- plan-fact:nowhere -->", "**ships**")),
        )
        self.assertIn(
            "nowhere",
            " ".join(finding["why"] for finding in found),
            msg="expected the finding to name the undefined fact in the marker",
        )

    def test_a_fact_the_page_stopped_quoting_is_a_finding(self):
        fact = {"tabs": {"kind": "json_count", "path": "app/tabs.json", "pointer": "tabs"}}
        found = self.facts(fact, plan(("Scope", "three tabs (`npm run test:scope`)", "**ships**")))
        self.assertIn(
            "no longer quoted",
            " ".join(finding["why"] for finding in found),
            msg="expected a defined-but-unused fact to fail, so deleting a claim does not leave a dead fact",
        )

    def test_a_fact_that_cannot_be_measured_is_a_finding(self):
        fact = {"tabs": {"kind": "json_count", "path": "app/missing.json", "pointer": "tabs"}}
        found = self.facts(
            fact,
            plan(("Scope", "three tabs (`npm run test:scope`) 3<!-- plan-fact:tabs -->", "**ships**")),
        )
        self.assertTrue(
            any("could not be measured" in finding["why"] for finding in found),
            msg=f"expected an unreadable fact to be reported, not skipped; got {found}",
        )

    def test_the_exit_codes_and_the_json_report(self):
        with tempfile.TemporaryDirectory() as bare:
            self.assertEqual(
                check_plan_rows.main(["--root", bare]),
                2,
                msg="expected exit 2 when the plan cannot be read at all",  # no docs/PLAN-2.0-GAP.md
            )
        text = plan(("Scope", "half of it (`npm run test:scope`)", "partial"))
        with open(os.path.join(self.root, "docs", "PLAN-2.0-GAP.md"), "w", encoding="utf-8") as handle:
            handle.write(text)
        self.assertEqual(
            check_plan_rows.main(["--root", self.root, "--json"]),
            1,
            msg="expected 1 on findings, so a caller can tell a red gate from a bad invocation",
        )


class ThisRepository(unittest.TestCase):
    def test_the_plan_has_no_open_rows_and_every_row_is_backed(self):
        with open(check_plan_rows.PLAN, encoding="utf-8") as handle:
            text = handle.read()
        found, read = check_plan_rows.check(text)
        self.assertEqual(
            found,
            [],
            msg=f"expected the shipped plan to pass; a reader cannot run {found} — fix the row",
        )
        self.assertGreaterEqual(
            read,
            check_plan_rows.MIN_ROWS,
            msg=f"expected the plan to carry at least {check_plan_rows.MIN_ROWS} rows; read {read}",
        )

    def test_every_fact_is_measured_and_quoted(self):
        self.assertTrue(
            os.path.exists(check_plan_rows.FACTS),
            msg="expected docs/plan-facts.json to exist: the page's numbers point at it",
        )
        with open(check_plan_rows.PLAN, encoding="utf-8") as handle:
            text = handle.read()
        with open(check_plan_rows.FACTS, encoding="utf-8") as handle:
            facts = json.load(handle).get("facts", {})
        self.assertGreaterEqual(
            len(facts),
            10,
            msg=f"expected the registry to cover the page's counts; it defines {len(facts)}",
        )
        self.assertEqual(
            check_plan_rows.fact_findings(text, check_plan_rows.ROOT),
            [],
            msg="expected every marked number to equal its fact; a stale one is the finding",
        )


if __name__ == "__main__":
    unittest.main()
