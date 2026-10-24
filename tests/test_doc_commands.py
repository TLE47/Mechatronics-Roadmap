#!/usr/bin/env python3
"""The docs' commands are a contract, and this pins the rules that read it.

`scripts/check_doc_commands.py` promises that every `npm run …` and every `scripts/…` path named in an
instruction page exists. That promise is only worth something if the reading is right, so this test pins
each rule the script relies on — the placeholder that must not become a finding, the flags that belong to
the script rather than the gate, the line number a reader needs, history that must stay unread — and then
checks the repository itself, because a gate that is green only on synthetic input is a gate that has not
been run.

Run: `python3 tests/test_doc_commands.py` (also discovered by `python3 -m unittest discover -s tests`).
"""

import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_doc_commands  # noqa: E402

SCRIPTS = {"test:scope", "check:weight", "dev"}


def problems(text, root=ROOT):
    return check_doc_commands.problems_in(text, "doc.md", SCRIPTS, root)


class DocCommandRules(unittest.TestCase):
    def test_an_unknown_npm_script_is_named_with_its_line(self):
        found = problems("intro\n\nrun `npm run no:such` to do the thing\n")
        self.assertEqual(
            len(found),
            1,
            msg=f"expected exactly one finding for one unknown script; got {found} — check the regex",
        )
        self.assertEqual(
            found[0]["name"],
            "no:such",
            msg=f"expected the finding to name the script, not the line; got {found[0]} — check the capture",
        )
        self.assertEqual(
            found[0]["line"],
            3,
            msg=f"expected line 3, where the sentence is; got {found[0]['line']} — check the line counter",
        )

    def test_flags_belong_to_the_script_not_the_gate(self):
        for line in ("npm run check:weight -- --record", "npm run test:scope  --json"):
            self.assertEqual(
                problems(line),
                [],
                msg=f"expected the trailing flags to be ignored, not read as a script; got {problems(line)}",
            )

    def test_a_placeholder_is_not_a_finding(self):
        for line in ("npm run", "npm run `<script>`", "see npm run test: for the family"):
            self.assertEqual(
                problems(line),
                [],
                msg=f"expected no finding for {line!r} — a family name is not a missing script",
            )

    def test_a_known_script_passes(self):
        self.assertEqual(
            problems("npm run test:scope"),
            [],
            msg="expected a script that exists in package.json to pass; check the lookup set",
        )
        self.assertEqual(
            problems("npm run dev"),
            [],
            msg="expected the shortest script name to pass too; check the name parsing",
        )

    def test_a_missing_file_is_named(self):
        found = problems("python3 scripts/no_such_gate.py --check")
        self.assertEqual(
            len(found),
            1,
            msg=f"expected exactly one finding for a missing file; got {found} — check the path regex",
        )
        self.assertEqual(
            found[0]["name"],
            "scripts/no_such_gate.py",
            msg=f"expected the finding to name the missing path; got {found[0]} — check the capture",
        )
        self.assertEqual(
            found[0]["kind"],
            "file",
            msg=f"expected the kind to be 'file', so the report can word it; got {found[0]['kind']}",
        )

    def test_the_interpreter_prefixes_are_all_read(self):
        for line in (
            "python3.12 scripts/check_all.py",
            "node scripts/smoke_test_workbench.mjs",
            "node --experimental-strip-types scripts/test_scope.mjs",
        ):
            self.assertEqual(
                len(list(check_doc_commands.iter_commands(line))),
                1,
                msg=f"expected one command out of {line!r}; check the three prefixes the docs use",
            )

    def test_history_is_not_read(self):
        self.assertNotIn(
            "CHANGELOG.md",
            check_doc_commands.DOCS,
            msg="expected the changelog to stay unread: it records what was true then, not what is",
        )
        self.assertNotIn(
            "docs/dogfood-log.md",
            check_doc_commands.DOCS,
            msg="expected the dogfood log to stay unread for the same reason as the changelog",
        )

    def test_a_named_page_that_is_missing_is_itself_a_finding(self):
        with tempfile.TemporaryDirectory() as empty:
            with open(os.path.join(empty, "package.json"), "w", encoding="utf-8") as handle:
                handle.write('{"scripts": {}}')
            found, checked = check_doc_commands.scan(empty)
        self.assertEqual(
            checked,
            0,
            msg=f"expected no commands in a tree with no pages; got {checked} — check the skip",
        )
        self.assertEqual(
            {row["kind"] for row in found},
            {"page"},
            msg=f"expected every listed-but-absent page to be reported as 'page'; got {found}",
        )


class ThisRepository(unittest.TestCase):
    def test_every_command_the_docs_name_exists(self):
        found, checked = check_doc_commands.scan(ROOT)
        self.assertEqual(
            found,
            [],
            msg=f"expected every named command to exist; a reader cannot run {found} — check the sentence",
        )
        self.assertGreater(
            checked,
            200,
            msg=f"expected the instruction pages to name hundreds of commands; found {checked} — check DOCS",
        )


if __name__ == "__main__":
    unittest.main()
