#!/usr/bin/env python3
"""Tests for `scripts/generate_run_callouts.py` and the callout on every workbench page.

A reader who lands on a page from a search has no way to know the code runs somewhere else, so the
page carries the pointer - or, when the page has no entry, says so plainly instead of sending them
hunting for one. The failures that matter:

1. **A page without one** - a lesson or graded-module page that never says anything about running.
2. **A wrong id** - the callout naming a lesson the list does not have, or the module's own id
   instead of its `EX.` entry, so the search box finds nothing.
3. **A stale copy** - the committed block drifting from what the script renders now.
4. **A doubled block** - re-running the generator stacking a second callout instead of replacing
   the first.

Run: `python3 tests/test_run_callout.py` (also wired into the CI verify step).
"""

import importlib.util
import os
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "generate_run_callouts.py")

spec = importlib.util.spec_from_file_location("generate_run_callouts", SCRIPT)
gr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gr)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


class RegistryTests(unittest.TestCase):
    def test_every_python_page_is_covered(self):
        pages = gr.workbench_pages()
        self.assertEqual(
            len(pages), 86,
            msg="expected 36 lesson pages and 50 graded-module pages in the registry; a smaller "
                "count means an entry's page was skipped, so its callout cannot be checked",
        )
        self.assertEqual(
            len({path for _, path in pages}), len(pages),
            msg="expected every page path to be claimed by exactly one workbench entry; a duplicate "
                "means two ids would overwrite each other's callout - check the exercise manifests",
        )

    def test_bench_and_ramp_lessons_are_marked_as_having_no_entry(self):
        pages = gr.no_entry_pages()
        self.assertEqual(
            len(pages), 18,
            msg="expected the 12 bench lessons (S0.1-S0.9, S0.M, 01.1, 01.2) and the 6 ramp lessons "
                "to be the only pages without an entry; another count means a runnable page is "
                "being told it has nothing to load - check the registry parse",
        )
        by_path = dict((rel, lesson_id) for lesson_id, rel in pages)
        self.assertEqual(
            by_path["stage-0/S0.3-breadboards-and-short-circuits.md"], "S0.3",
            msg="expected the bench lesson's own front-matter id; a missing id means the "
                "front-matter parse failed and the page would silently get no block at all",
        )
        self.assertEqual(
            by_path["ramp/R.1-rate-of-change.md"], "R.1",
            msg="expected the maths ramp page's own id; the ramp prints code but has no workbench "
                "entry, so it belongs with the bench lessons, not the registry",
        )

    def test_exercise_entries_use_the_module_page_and_the_ex_suffix(self):
        by_path = dict((path, lesson_id) for lesson_id, path in gr.workbench_pages())
        self.assertEqual(
            by_path["track-p/P.1-variables-and-data-types.md"], "P.1",
            msg="expected lesson P.1 to map to its own page path and plain id; another value means "
                "the registry parse paired the wrong fields - check the data file layout",
        )
        self.assertEqual(
            by_path["modules/05-control.T2.05a.md"], "EX.05-control.T2.05a",
            msg="expected an exercise entry to point at its module page under the EX. id; the bare "
                "module id means the workbench id was not read from the manifest",
        )

    def test_the_id_comes_from_the_registry_not_the_front_matter(self):
        # The module's own id is `05-control.T2.05a`; the workbench lists it as `EX.05-control.T2.05a`.
        page = read(os.path.join(ROOT, "modules", "05-control.T2.05a.md"))
        self.assertIn(
            "?lesson=EX.05-control.T2.05a", page,
            msg="expected the module page to link the workbench's own id, EX.05-control.T2.05a; "
                "the front-matter id alone would open nothing - check the registry parse",
        )
        self.assertNotIn(
            "?lesson=05-control.T2.05a", page,
            msg="expected no callout linking the module id without the EX. prefix; that is the "
                "drift this test exists to catch - re-run the generator",
        )

    def test_the_link_is_a_deep_link_the_app_can_open(self):
        # The callout's whole job is landing the reader on the right entry; a bare workbench link
        # would send them back to the search box the page just told them to skip.
        for lesson_id, rel in gr.workbench_pages():
            page = read(os.path.join(ROOT, rel))
            with self.subTest(page=rel):
                self.assertIn(
                    "%s?lesson=%s" % (gr.WORKBENCH, lesson_id), page,
                    msg="expected the callout to link the workbench with this entry preselected; a "
                        "bare workbench link loses the one instruction the block exists to give",
                )


class CommittedPageTests(unittest.TestCase):
    def test_check_mode_is_clean(self):
        self.assertEqual(
            gr.main(["--check"]), 0,
            msg="expected every lesson and module page to carry the current callout; a stale page "
                "is listed above - run python3 scripts/generate_run_callouts.py and commit it",
        )

    def test_every_lesson_page_is_covered(self):
        self.assertEqual(
            len(gr.all_pages()), 104,
            msg="expected 86 pages with a workbench entry and 18 without; a smaller total means a "
                "lesson page a search result can land on still says nothing",
        )

    def test_each_page_carries_exactly_one_block_under_its_heading(self):
        for lesson_id, rel in gr.all_pages():
            page = read(os.path.join(ROOT, rel))
            with self.subTest(page=rel):
                self.assertEqual(
                    page.count(gr.START), 1,
                    msg="expected exactly one generated block start marker; zero means the page "
                        "lost its callout, two means a re-run stacked a second one",
                )
                self.assertEqual(
                    page.count(gr.END), 1,
                    msg="expected exactly one generated block end marker; a mismatch with the start "
                        "count means the markers were edited by hand - check the page",
                )
                block = page[page.index(gr.START) : page.index(gr.END)]
                if lesson_id is None:
                    self.assertIn(
                        "No workbench entry", block,
                        msg="expected a page with no entry to say so; the alternative is a reader "
                            "searching Tab 2 for an entry that is not there",
                    )
                    self.assertNotIn(
                        "?lesson=", block,
                        msg="expected no deep link on a page with no entry; a link there is a "
                            "promise the app cannot keep - check the registry membership test",
                    )
                    continue
                self.assertIn(
                    "`%s`" % lesson_id, block,
                    msg="expected the callout to name its own workbench id; a different id means "
                        "the search box would not find this page's entry - re-run the generator",
                )
                # It is the first thing after the H1, or the first thing in the body on module
                # pages (they have no H1), so a reader cannot miss it above the fold.
                body = gr.split_front_matter(page)[1].lstrip("\n")
                if body.startswith("# "):
                    body = body.split("\n", 1)[1].lstrip("\n")
                self.assertTrue(
                    body.startswith(gr.START),
                    msg="expected the block to open the page body, directly under the heading; "
                        "anything between it and the title buries the one line a search visitor "
                        "needs - check the generator's placement rule",
                )

    def test_no_page_still_hand_rolls_the_pointer(self):
        # One standard line; a bespoke "open the browser runner and pick X" beside it would be a
        # second name for the same door, and the two can drift apart.
        for lesson_id, rel in gr.all_pages():
            page = read(os.path.join(ROOT, rel))
            with self.subTest(page=rel):
                self.assertNotIn(
                    "Open the browser runner", page,
                    msg="expected the page to carry only the generated pointer; a hand-written one "
                        "beside it can name the wrong id - fold it into the callout",
                )


class RenderTests(unittest.TestCase):
    LESSON = "---\nlesson_id: X.1\ntitle: \"t\"\n---\n\n# Lesson X.1: Title\n\nBody.\n"
    MODULE = "---\nid: track.X.1\n---\n\n## 1. Why it matters\nBody.\n"

    def test_idempotent(self):
        once = gr.with_callout(self.LESSON.replace("X.1", "P.1"), "P.1")
        twice = gr.with_callout(once, "P.1")
        self.assertEqual(
            once, twice,
            msg="expected a second render to leave the page byte-identical; a difference means the "
                "generator accumulates blank lines, so every CI run would dirty the tree",
        )

    def test_the_no_entry_variant_is_idempotent_too(self):
        once = gr.with_callout(self.LESSON, None)
        twice = gr.with_callout(once, None)
        self.assertEqual(
            once, twice,
            msg="expected a second render of the no-entry variant to be byte-identical; a "
                "difference would dirty 18 pages on every CI run - check the blank-line handling",
        )

    def test_module_page_gets_the_block_before_its_first_section(self):
        page = gr.with_callout(self.MODULE, "EX.track.X.1")
        body = gr.split_front_matter(page)[1].lstrip("\n")
        self.assertTrue(
            body.startswith(gr.START),
            msg="expected the block to be the first thing in a module page's body; a module has no "
                "H1, so the body start is the only place above the first section",
        )
        self.assertLess(
            page.index(gr.END), page.index("## 1. Why it matters"),
            msg="expected the block to sit above section 1; below it the callout would be skipped "
                "by anyone who scrolls to the exercise - check the placement rule",
        )

    def test_a_stale_id_is_rewritten_in_place(self):
        page = gr.with_callout(self.LESSON, "P.1")
        fixed = gr.with_callout(page, "P.2")
        self.assertIn(
            "`P.2`", fixed,
            msg="expected the rewritten block to name the new id; a page that keeps its old id "
                "sends the reader to an entry that does not exist",
        )
        self.assertNotIn(
            "`P.1`", fixed,
            msg="expected the old id to be gone rather than kept beside the new one; two ids in one "
                "callout means the replacement appended instead of replacing",
        )
        self.assertEqual(
            fixed.count(gr.START), 1,
            msg="expected one block after the rewrite; more means the generator stacked a second "
                "callout instead of reusing the marker pair",
        )

    def test_a_page_that_loses_its_entry_switches_variant(self):
        page = gr.with_callout(self.LESSON, "P.1")
        fixed = gr.with_callout(page, None)
        self.assertEqual(
            fixed.count(gr.START), 1,
            msg="expected the variant switch to replace the block; two blocks means the page would "
                "promise a run entry and deny one in the same screenful",
        )
        self.assertNotIn(
            "?lesson=", fixed,
            msg="expected the deep link to be gone once the page has no entry; a leftover link "
                "opens a workbench with nothing selected",
        )

    def test_a_page_without_front_matter_is_supported(self):
        page = gr.with_callout("# Title\n\nBody.\n", "P.3")
        self.assertTrue(
            page.startswith("# Title\n\n" + gr.START),
            msg="expected the block to follow the H1 on a page with no front matter; a page the "
                "generator cannot place silently grows no callout - check split_front_matter",
        )
        self.assertTrue(
            page.endswith("Body.\n"),
            msg="expected the original body to survive intact below the block; a truncated tail "
                "means the insertion lost content - check the tail handling",
        )


if __name__ == "__main__":
    unittest.main()
