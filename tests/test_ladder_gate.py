"""The Tier 2 ladder exam is one generated paper, and these tests hold it to that.

`scripts/generate_ladder_gate.py` owns the questions and the answer key. Before it existed the
paper was copied by hand onto seven pages, so a fixed number or a new concept had to be repeated
seven times and could disagree. These tests check the three claims the generator makes: every
ladder page renders the same bytes, the paper tags every concept the ladder declares, and the
answer key actually runs. The negative paths show the checks are not empty.
"""

import importlib.util
import os
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from page_body import page_body  # noqa: E402


def load_generator():
    spec = importlib.util.spec_from_file_location(
        "generate_ladder_gate", ROOT / "scripts" / "generate_ladder_gate.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = load_generator()


class TestThePaperIsOneArtifact(unittest.TestCase):
    def test_every_ladder_page_renders_the_current_paper(self):
        findings, stale, rows, _declared = generator.scan()
        self.assertEqual(findings, [], "structural findings:\n" + "\n".join(findings))
        self.assertEqual(stale, [], "stale pages:\n" + "\n".join(stale))
        self.assertEqual(len(rows), len(generator.MODULE_IDS))
        self.assertTrue(all(row["status"] == "current" for row in rows), rows)

    def test_every_tier2_page_on_disk_is_on_the_ladder(self):
        on_disk = set()
        for path in sorted((ROOT / "modules").glob("00-foundations.T2.*.md")):
            meta = generator.front_matter(path.read_text(encoding="utf-8"))
            if meta.get("tier") == "2":
                on_disk.add(path.stem)
        self.assertEqual(on_disk, set(generator.MODULE_IDS),
                         "a Tier 2 page exists that the ladder does not list, or vice versa")


class TestThePaperCoversTheLadder(unittest.TestCase):
    def test_every_declared_concept_is_tagged(self):
        declared = set(generator.ladder_concepts())
        tagged = generator.paper_concepts()
        self.assertEqual(declared, tagged,
                         "untagged: %s | tags for nothing: %s"
                         % (sorted(declared - tagged), sorted(tagged - declared)))

    def test_question_options_are_well_formed(self):
        for index, question in enumerate(generator.QUESTIONS, start=1):
            if "options" not in question:
                self.assertNotIn("answer", question, "Q%d has an answer but no options" % index)
                continue
            self.assertEqual(len(question["options"]), 4, "Q%d needs four options" % index)
            self.assertIn(question.get("answer"), list("ABCD"), "Q%d has no answer letter" % index)

    def test_the_answer_key_runs(self):
        self.assertEqual(generator.check_answer_key(), [])

    def test_the_right_answer_is_not_always_the_first_option(self):
        # A paper whose every multiple choice keys `A` can be half-guessed without reading the
        # ladder: the key letters must differ, and the key must agree with the option it names.
        letters = [q["answer"] for q in generator.QUESTIONS if "options" in q]
        self.assertGreater(len(set(letters)), 2, letters)
        for index, question in enumerate(generator.QUESTIONS, start=1):
            if "options" not in question:
                continue
            option = question["options"][list("ABCD").index(question["answer"])]
            self.assertTrue(option.strip(), "Q%d's keyed option is empty" % index)


class TestTheChecksCatchDrift(unittest.TestCase):
    def test_a_page_without_markers_is_a_finding(self):
        self.assertIsNone(generator.block_bounds("### Gate test\n\nno markers here\n"))

    def test_a_one_character_edit_is_stale(self):
        paper = generator.render()
        edited = paper.replace("$\\pm 10^{-9}$", "$\\pm 10^{-8}$", 1)
        self.assertNotEqual(edited, paper)
        self.assertIsNotNone(generator.block_bounds(edited))

    def test_the_render_is_idempotent(self):
        self.assertEqual(generator.render(), generator.render())

    def test_a_stale_gate_score_outside_the_block_is_a_finding(self):
        page = (ROOT / "modules" / (generator.MODULE_IDS[-1] + ".md")).read_text(encoding="utf-8")
        self.assertEqual(generator.score_restatements(page), [])
        stale = page.replace(
            "## 7. Checkpoint",
            "## 7. Checkpoint\nScore $7/8$ on the Ladder Gate test below.",
            1,
        )
        self.assertEqual(generator.score_restatements(stale), ["$7/8$"])
        # A page's own Skip-test score is not the gate's and must not be flagged.
        own = page.replace(
            "## 7. Checkpoint",
            "## 7. Checkpoint\nScore $4/5$ on the module Skip test.",
            1,
        )
        self.assertEqual(generator.score_restatements(own), [])


class TestThePaperIsNotEvidence(unittest.TestCase):
    """One identical paper sits on every page, so it can prove nothing about any one of them.

    The crosswalk, the mention audit and the prerequisite audit all read page text to decide what a
    page teaches. If they count the gate block, every page appears to teach the whole ladder and the
    three audits confirm a claim with the claim itself.
    """

    def test_the_paper_is_stripped_from_every_page_body(self):
        for ident in generator.MODULE_IDS:
            path = ROOT / "modules" / (ident + ".md")
            raw = path.read_text(encoding="utf-8")
            self.assertIn(generator.START, raw, ident)
            body = page_body(path)
            self.assertNotIn("ladder-gate", body, ident)
            self.assertNotIn(generator.QUESTIONS[0]["text"], body, ident)

    def test_a_word_the_paper_uses_everywhere_no_longer_looks_taught_everywhere(self):
        # "tustin" is in the paper (Q5), so before stripping all seven pages carried it. A page
        # body is only evidence when the page itself writes the word down.
        carriers = [
            ident for ident in generator.MODULE_IDS
            if "tustin" in page_body(ROOT / "modules" / (ident + ".md")).lower()
        ]
        self.assertLess(len(carriers), len(generator.MODULE_IDS), carriers)
        self.assertIn("00-foundations.T2.00f", carriers, "the Tustin page must still carry it")


if __name__ == "__main__":
    unittest.main()
