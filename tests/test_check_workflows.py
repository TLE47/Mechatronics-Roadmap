#!/usr/bin/env python3
"""The workflow scan must fail on the lines YAML refuses, and stay quiet on the ones it allows.

`check_workflows.py` exists because `ci.yml` shipped a step name with an unquoted `: ` in it and
every push failed in 0 s with no jobs. A gate that only ever runs against the files currently in the
tree would have passed that file too, so these tests feed it the shapes by hand: the historical
broken line, the legal ones either side of it (a quoted value, a `run: |` body, a `check:native`
that is not a separator), and the neighbours of the same class - a tab, a never-closed quote, an
unbalanced flow collection, a duplicated key, a file with no `jobs:`.

The duplicate-key case is the one that needs care, not because it is hard to detect but because the
obvious detector cries wolf: every step of a workflow has a `name:` at the same column, and those are
different mappings. Both halves are asserted here.

Run: `python3 tests/test_check_workflows.py` (also discovered by `python3 -m unittest discover`).
"""

import contextlib
import io
import os
import sys
import tempfile
import textwrap
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_workflows  # noqa: E402


def findings_for(text):
    """Scan a workflow body written as a string; return the finding lines, blocks and all."""
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, "ci.yml")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(textwrap.dedent(text).lstrip("\n"))
        return check_workflows.scan_workflow(path)


class ShippedWorkflowsTests(unittest.TestCase):
    def test_every_workflow_in_the_repository_parses(self):
        paths = sorted(
            os.path.join(ROOT, ".github", "workflows", name)
            for name in os.listdir(os.path.join(ROOT, ".github", "workflows"))
            if name.endswith((".yml", ".yaml"))
        )
        self.assertGreaterEqual(len(paths), 3, msg="expected the three workflows this repo ships")
        for path in paths:
            with self.subTest(workflow=os.path.basename(path)):
                self.assertEqual(
                    check_workflows.scan_workflow(path),
                    [],
                    msg="expected a shipped workflow to parse; a finding here is a run that fails "
                    "in 0 s with no jobs, which is how an unquoted `: ` in a step name reads",
                )


class ColonTests(unittest.TestCase):
    def test_an_unquoted_colon_in_a_step_name_is_a_finding(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - name: Check light/dark: toggle contract and contrast
                    run: npm run test:theme:e2e
            """
        )
        self.assertEqual(len(findings), 1, msg=f"expected exactly the unquoted colon, got {findings}")
        self.assertIn("ci.yml:6", findings[0], msg="expected the finding to name the line to fix")
        self.assertIn(
            "another mapping",
            findings[0],
            msg="expected the finding to say why: a colon reads as another mapping key",
        )

    def test_quoting_the_same_line_is_clean(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - name: "Check light/dark: toggle contract and contrast"
                    run: npm run test:theme:e2e
            """
        )
        self.assertEqual(findings, [], msg="expected a quoted colon to pass; quoting is the fix")

    def test_a_colon_without_a_space_stays_in_the_value(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - run: npm run check:native
                  - run: python3 -m unittest discover -s tests
            """
        )
        self.assertEqual(findings, [], msg="expected `check:native` and `-m` to read as one line")

    def test_a_block_scalar_body_is_text_not_yaml(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - name: Run the gates
                    run: |
                      echo "a: b"
                      python3 scripts/check_all.py  # a comment: with a colon
                  - name: After the block
                    run: echo done
            """
        )
        self.assertEqual(findings, [], msg="expected `run: |` bodies to be skipped entirely")


class NeighbourTests(unittest.TestCase):
    def test_a_tab_in_the_indentation_is_a_finding(self):
        findings = findings_for(
            "on: [push]\njobs:\n\tbuild:\n    runs-on: ubuntu-latest\n"
        )
        self.assertTrue(
            any("tab indentation" in finding for finding in findings),
            msg=f"expected the tab in the indentation to be reported; got {findings}",
        )

    def test_a_quote_that_never_closes_is_a_finding(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - name: "half a quote
                    run: echo hi
            """
        )
        self.assertTrue(
            any("never closed" in finding for finding in findings),
            msg=f"expected the unclosed quote to be reported; got {findings}",
        )

    def test_an_unbalanced_flow_collection_is_a_finding(self):
        findings = findings_for(
            """
            on:
              push:
                branches: ["main", "master"
            jobs:
              build:
                runs-on: ubuntu-latest
            """
        )
        self.assertTrue(
            any("never closed" in finding for finding in findings),
            msg=f"expected the unclosed `[` to be reported; got {findings}",
        )

    def test_a_reserved_indicator_at_the_start_of_a_value_is_a_finding(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - name: @ not a name
                    run: echo hi
            """
        )
        self.assertTrue(
            any("reserved indicator" in finding for finding in findings),
            msg=f"expected `@` at the start of a value to be reported; got {findings}",
        )

    def test_a_key_set_twice_in_one_mapping_is_a_finding(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                runs-on: macos-latest
            """
        )
        self.assertTrue(
            any("set twice" in finding for finding in findings),
            msg=f"expected the duplicate `runs-on` to be reported; got {findings}",
        )

    def test_sibling_steps_may_repeat_their_keys(self):
        findings = findings_for(
            """
            on: [push]
            jobs:
              build:
                runs-on: ubuntu-latest
                steps:
                  - name: One
                    uses: actions/checkout@v4
                  - name: Two
                    uses: actions/setup-node@v4
                    with:
                      node-version: "22"
                  - name: Three
                    run: echo hi
            """
        )
        self.assertEqual(
            findings,
            [],
            msg="expected each step to be its own mapping; every step has a `name:`, and that is not "
            "a duplicate - a detector that says it is would block every push",
        )

    def test_a_workflow_without_jobs_is_a_finding(self):
        findings = findings_for(
            """
            on: [push]
            permissions:
              contents: read
            """
        )
        self.assertTrue(
            any("no top-level `jobs:`" in finding for finding in findings),
            msg=f"expected a workflow with no jobs to be reported; got {findings}",
        )


class CommandLineTests(unittest.TestCase):
    def test_a_name_that_matches_no_workflow_is_a_usage_error(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(
                check_workflows.main(["no-such-workflow"]),
                2,
                msg="expected an unknown workflow name to exit 2, not to pass silently",
            )

    def test_a_bare_name_resolves_to_the_shipped_file(self):
        paths, missing = check_workflows.resolve(["ci"])
        self.assertEqual(missing, [], msg="expected `ci` to find .github/workflows/ci.yml")
        self.assertEqual(
            [os.path.basename(path) for path in paths],
            ["ci.yml"],
            msg="expected the bare name to resolve to exactly one file",
        )


if __name__ == "__main__":
    unittest.main()
