"""Every Skip test is rendered from one store, and these tests hold it to that.

`resources/skip-tests.json` is the only copy of the 48 Skip tests; `scripts/generate_skip_tests.py`
renders them into the pages between the `skip-test` markers. Before the store existed each section
was hand-written, so a pass mark, a question or a key could drift page by page with nothing to
notice. The checks below pin the five claims the generator makes, plus the failure modes that
would otherwise pass silently.
"""

import copy
import importlib.util
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generate_skip_tests as generator  # noqa: E402


class TestThePagesRenderTheStore(unittest.TestCase):
    def test_every_kept_arrow_names_a_page_that_teaches_its_concept(self):
        # Run 74 removed 28 arrows; the ones still present must survive the pointer rule, so the
        # audit cannot silently leave a dead target behind.
        for module_id, entry in generator.load_store().items():
            for question in entry["questions"]:
                match = generator.SPACED.search(question["tag"])
                if not match:
                    continue
                target = match.group(1).split("—")[0].strip()
                concept = generator.CONCEPT.search(match.group(1)).group(1)
                self.assertIn(
                    target, generator.PAGES,
                    f"expected the spaced-review arrow on {module_id} to point at a real page; "
                    f"{target!r} is not in PAGES - check the page was renamed after the arrow "
                    f"was authored",
                )
                proven = generator.concepts_map().get(concept, {}).get("page") == target
                self.assertTrue(
                    concept in generator.concepts_declared_by(target) or proven,
                    f"expected {target} to teach {concept}, the concept {module_id}'s "
                    f"spaced-review arrow sends the learner back to; a dead target turns "
                    f"review into a page that never mentions it",
                )

    def test_scan_is_clean(self):
        findings, stale, rows = generator.scan()
        listed = "\n".join(findings)
        self.assertEqual(
            findings, [],
            f"expected no structural findings from the skip-test generator; check each page's "
            f"marker pairs and pass mark:\n{listed}",
        )
        listed = "\n".join(stale)
        self.assertEqual(
            stale, [],
            f"expected every page to carry the store's current rendering; these differ from "
            f"render() - run python3 scripts/generate_skip_tests.py rather than editing a page "
            f"by hand:\n{listed}",
        )
        self.assertTrue(
            rows,
            "expected scan() to return one row per page; an empty list means the walk found no "
            "pages at all, which would make this test pass silently",
        )
        self.assertTrue(
            all(row["status"] == "current" for row in rows),
            f"expected every row to report status 'current'; these did not: "
            f"{[row for row in rows if row['status'] != 'current']}",
        )

    def test_every_bridge_module_has_an_entry(self):
        store = generator.load_store()
        on_disk = [
            path.stem for path in sorted((ROOT / "modules").glob("*.md"))
            if generator.HEADING in path.read_text(encoding="utf-8")
        ]
        self.assertEqual(
            sorted(store), on_disk,
            f"expected the store and the pages carrying a Skip-test heading to be the same set; "
            f"only in the store: {sorted(set(store) - set(on_disk))}, only on disk: "
            f"{sorted(set(on_disk) - set(store))} - a page with no entry renders nothing, and an "
            f"entry with no page is dead weight",
        )

    def test_the_spaced_review_report_counts_what_the_store_says(self):
        # The report is what keeps the remaining gap visible - Run 74 left 30 pages without a
        # review, Run 75 authored one for each non-root page - and the count must come from the
        # store, not be written down in the test.
        store = generator.load_store()
        report = generator.spaced_review_report(store)
        arrows = sum(1 for entry in store.values() for question in entry["questions"]
                     if "Spaced review" in question["tag"])
        self.assertEqual(
            report["arrows"], arrows,
            f"expected the report's arrow count to be the store's own Spaced review questions "
            f"({arrows}); got {report['arrows']} - a written-in number would hide the remaining gap",
        )
        self.assertEqual(
            report["pages_with_review"] + len(report["pages_without_review"]), len(store),
            f"expected every store entry to be classified as with or without a review; got "
            f"{report['pages_with_review']} + {len(report['pages_without_review'])} against "
            f"{len(store)} entries - check the two lists are built from one pass",
        )

    @staticmethod
    def prereqs_of(text):
        """The front matter's `prereqs:` list, whether it is written inline or as block items."""
        front = text.split("---", 2)[1]
        key = re.search(r"(?m)^prereqs:[ \t]*(.*)$", front)
        if key is None:
            return []
        if not re.fullmatch(r"\[\s*\]", key.group(1).strip()):
            if key.group(1).strip():
                return re.findall(r"[\w.-]+\.T\d[\w.-]*", key.group(1))
            # Block form: the items are the indented `- ...` lines that follow the key, up to the
            # next top-level front-matter key (`new_concepts`, `uses`, ...).
            rest = front[key.end():]
            nxt = re.search(r"(?m)^[A-Za-z_]+:", rest)
            return re.findall(r"(?m)^\s+-\s+(\S+)", rest[:nxt.start()] if nxt else rest)
        return []

    def test_every_non_root_page_carries_a_spaced_review(self):
        # ASSESSMENTS.md asks every non-root module for a `[Spaced review -> prior]` question. The
        # root page has no earlier page to review, which is the one exemption; a page that fails
        # this either lost its review in an audit or is new and still owes one.
        store = generator.load_store()
        for module_id in sorted(store):
            text = pathlib.Path(generator.page_path(module_id)).read_text(encoding="utf-8")
            if not self.prereqs_of(text):
                self.assertEqual(
                    module_id, "00-foundations.T1.00a",
                    f"expected {module_id}, which names no prerequisites, to be the root page "
                    f"00-foundations.T1.00a - it is the only page with nothing earlier to review, "
                    f"so any other id here is a page that lost its prereqs line and its review",
                )
                continue
            with self.subTest(module=module_id):
                self.assertTrue(
                    any("Spaced review" in question["tag"] for question in store[module_id]["questions"]),
                    f"expected {module_id} to carry a spaced-review question, since "
                    f"ASSESSMENTS.md asks every non-root page for one; check the store entry, "
                    f"which is the only place the question can come from",
                )

    def test_the_store_covers_every_question_with_an_assert(self):
        for module_id, entry in generator.load_store().items():
            with self.subTest(module=module_id):
                self.assertRegex(
                    entry["key"], r"(?m)^assert ",
                    f"expected {module_id}'s answer key to contain an `assert ` line, which is "
                    f"what the browser runs to grade the page; a print-only key grades nothing",
                )
                self.assertEqual(
                    entry["mark"][1], len(entry["questions"]),
                    f"expected {module_id}'s pass mark denominator to be its question count "
                    f"({len(entry['questions'])}); got {entry['mark'][1]} - check the store's "
                    f"mark field, since the rendered line reads straight off it",
                )


class TestTheChecksCatchDrift(unittest.TestCase):
    def setUp(self):
        self.store = generator.load_store()
        self.module_id = "00-foundations.T2.00a"
        self.entry = copy.deepcopy(self.store[self.module_id])
        self.text = (ROOT / "modules" / (self.module_id + ".md")).read_text(encoding="utf-8")

    def findings(self, entry=None, text=None):
        return generator.findings_for(self.module_id, entry or self.entry, text or self.text)

    def test_a_mark_that_disagrees_with_the_question_count_is_a_finding(self):
        # Derived from the fixture, not written down: the question count moves whenever a review
        # question is authored, and the check is about the disagreement, not about `3/5`.
        count = len(self.entry["questions"])
        self.entry["mark"] = [count - 1, count + 1]
        self.assertTrue(
            any("pass mark" in finding for finding in self.findings()),
            f"expected a mark of {count - 1}/{count + 1} against {count} questions to be "
            f"reported; got {self.findings()} - check the mark-versus-question-count clause",
        )

    def test_a_checkpoint_promise_that_drifted_is_a_finding(self):
        mark = self.entry["mark"]
        text = self.text.replace("($%d/%d$) on the Skip test" % (mark[0], mark[1]),
                                 "($%d/%d$) on the Skip test" % (mark[0], mark[1] + 1), 1)
        self.assertNotEqual(
            text, self.text,
            f"expected the doctoring to change the Checkpoint's quoted mark; it matched nothing, "
            f"so the drift check below would test an unmodified page - check the wording around "
            f"(${mark[0]}/{mark[1]}$)",
        )
        self.assertTrue(
            any("Checkpoint promises" in finding for finding in self.findings(text=text)),
            f"expected a Checkpoint promising {mark[0]}/{mark[1] + 1} while the store says "
            f"{mark[0]}/{mark[1]} to be reported; got {self.findings(text=text)}",
        )

    def test_a_mark_below_the_eighty_percent_bar_is_a_finding(self):
        # `05-control.T3.05b` asked 3/4 (75%) while its own Checkpoint promised 80%; the floor has
        # to be checked, not just the denominator.
        count = len(self.entry["questions"])
        below = -(-count * 4 // 5) - 1          # one question short of ceil(0.8 * count)
        self.entry["mark"] = [below, count]
        self.assertTrue(
            any("below the 80% bar" in finding for finding in self.findings()),
            f"expected a {below}/{count} mark to be reported as under the 80% bar (the pass "
            f"floor is ceil(0.8*{count}) = {-(-count * 4 // 5)}); got {self.findings()} - check "
            f"the floor is compared, not just the denominator",
        )

    def test_a_question_tagging_a_foreign_concept_is_a_finding(self):
        self.entry["questions"][0]["tag"] = "[Recall] [Concept: something_else]"
        self.assertTrue(
            any("does not declare" in f for f in self.findings()),
            f"expected a question tagging a concept the page never declares to be reported; got "
            f"{self.findings()} - check the declared-concept comparison",
        )

    def test_a_concept_with_no_question_is_a_finding(self):
        for question in self.entry["questions"]:
            question["tag"] = question["tag"].replace(
                "finite_difference_derivative_and_integral", "something_else")
        findings = self.findings()
        self.assertTrue(
            any("no question examines `finite_difference" in f for f in findings),
            f"expected retagging every question away from the page's own concept to be reported "
            f"as a concept nothing examines; got {findings} - a declared concept with no question "
            f"is a promise the page does not keep",
        )

    def test_a_key_that_skips_a_question_is_a_finding(self):
        self.entry["key"] = "\n".join(
            line for line in self.entry["key"].split("\n") if not line.startswith("q4_"))
        self.assertTrue(
            any("never evaluates" in f for f in self.findings()),
            f"expected a key with q4 removed to be reported as never evaluating that question; "
            f"got {self.findings()} - check that every question has a key line",
        )

    def test_a_key_that_does_not_run_is_a_finding(self):
        self.entry["key"] = self.entry["key"].replace("assert ", "assert  ", 1) + "\nraise SystemExit(3)"
        self.assertTrue(
            any("does not run" in f for f in self.findings()),
            f"expected a key ending in raise SystemExit(3) to be reported as not running; got "
            f"{self.findings()} - a key that exits silently grades every submission as failed",
        )

    def test_a_missing_role_class_is_a_finding(self):
        self.entry["questions"] = [
            {"tag": "[Apply] [Concept: finite_difference_derivative_and_integral]", "text": "x"}
        ]
        self.entry["mark"] = [1, 1]
        findings = self.findings()
        self.assertTrue(
            any("[Recall]" in f for f in findings),
            f"expected a page whose questions carry no [Recall] role to be reported; got "
            f"{findings} - the roles are what the spaced-review ladder is graded from",
        )

    def test_a_spaced_review_may_name_an_earlier_page_concept(self):
        # `00-foundations.T2.00a` declares only its own concept; its spaced-review question names
        # an earlier page's, which is the point of spaced review and must not be reported.
        self.assertFalse(
            any("does not declare" in finding and "radians" in finding
                for finding in self.findings()),
            f"expected a spaced-review question naming an earlier page's concept to pass; got "
            f"{self.findings()} - flagging it would forbid spaced review itself",
        )

    def test_a_page_without_markers_is_a_finding(self):
        self.assertIsNone(
            generator.block_bounds("### Skip test\n\nno markers\n"),
            "expected block_bounds to return None when a page carries no START/END markers; "
            "a span here would let a page with no rendered block pass as current",
        )

    def test_a_multiple_choice_question_needs_four_options_and_a_keyed_letter(self):
        module_id = "00-foundations.T2.00b"
        entry = copy.deepcopy(self.store[module_id])
        text = (ROOT / "modules" / (module_id + ".md")).read_text(encoding="utf-8")
        mc = next(q for q in entry["questions"] if q.get("options"))
        mc["options"] = mc["options"][:3]
        self.assertTrue(
            any("expected 4" in f for f in generator.findings_for(module_id, entry, text)),
            f"expected a multiple-choice question cut to 3 options to be reported as needing 4; "
            f"got {generator.findings_for(module_id, entry, text)} - a 3-option question can be "
            f"half-guessed",
        )

        entry = copy.deepcopy(self.store[module_id])
        mc = next(q for q in entry["questions"] if q.get("options"))
        mc["options"] = mc["options"]
        index = entry["questions"].index(mc) + 1
        entry["key"] = "\n".join(
            line for line in entry["key"].split("\n")
            if not line.startswith("q%d_" % index) and "q%d_" % index not in line
        )
        self.assertTrue(
            any("names no choice letter" in f
                for f in generator.findings_for(module_id, entry, text)),
            f"expected a multiple-choice question whose key line was removed to be reported as "
            f"naming no choice letter; got {generator.findings_for(module_id, entry, text)}",
        )

    def test_a_spaced_review_must_name_a_page_that_teaches_the_concept(self):
        module_id = "00-foundations.T2.00b"
        text = (ROOT / "modules" / (module_id + ".md")).read_text(encoding="utf-8")
        entry = copy.deepcopy(self.store[module_id])
        spaced = next(q for q in entry["questions"] if "Spaced review" in q["tag"])
        spaced["tag"] = spaced["tag"].replace("00-foundations.T2.00g", "00-foundations.T9.99")
        self.assertTrue(
            any("is not a page" in f for f in generator.findings_for(module_id, entry, text)),
            f"expected a spaced-review arrow pointing at the nonexistent page "
            f"00-foundations.T9.99 to be reported; got "
            f"{generator.findings_for(module_id, entry, text)}",
        )

        entry = copy.deepcopy(self.store[module_id])
        spaced = next(q for q in entry["questions"] if "Spaced review" in q["tag"])
        spaced["tag"] = "[Spaced review -> 00-foundations.T2.00a — Concept: none]"
        self.assertFalse(
            any("is not a page" in f for f in generator.findings_for(module_id, entry, text)),
            f"expected an arrow to an existing page to pass however its concept is spelled; got "
            f"{generator.findings_for(module_id, entry, text)} - only a missing page is this "
            f"check's business",
        )


class TestTheRenderIsStable(unittest.TestCase):
    def test_render_is_deterministic_and_marker_wrapped(self):
        store = generator.load_store()
        entry = store["00-foundations.T2.00a"]
        first, second = generator.render(entry), generator.render(entry)
        self.assertEqual(
            first, second,
            "expected two renders of one store entry to be identical; a difference means the "
            "generator reads something that changes between calls, making every page stale",
        )
        self.assertTrue(
            first.startswith("\n" + generator.START),
            f"expected the render to open with a newline and the START marker {generator.START!r}, "
            f"which is what lets the block be replaced in place; got {first[:60]!r}",
        )
        self.assertTrue(
            first.endswith(generator.END + "\n\n"),
            f"expected the render to close with the END marker and a blank line; got "
            f"{first[-40:]!r} - a missing END marker leaves the next render nothing to replace",
        )
        self.assertIn(
            "**Answer key:**", first,
            "expected the render to carry the answer key heading the page's own text refers to; "
            "check render's section assembly",
        )
        self.assertIn(
            f"- **Pass mark:** ${entry['mark'][0]}/{entry['mark'][1]}$", first,
            f"expected the rendered pass mark to read off the store's {entry['mark']}; check "
            f"render's mark line, since a hardcoded one would survive a store edit",
        )

    def test_one_character_edit_makes_the_page_stale(self):
        store = generator.load_store()
        rendered = generator.render(store["00-foundations.T1.00a"])
        edited = rendered.replace("$\\pm 10^{-9}$", "$\\pm 10^{-8}$", 1)
        self.assertNotEqual(
            edited, rendered,
            "expected the one-digit doctoring to change the render; it matched nothing, so this "
            "test no longer proves a page edit is detectable",
        )


if __name__ == "__main__":
    unittest.main()
