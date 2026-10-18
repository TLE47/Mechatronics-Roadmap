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
        listed = "\n".join(findings)
        self.assertEqual(
            findings, [],
            f"expected no structural findings from the ladder generator; check the marker "
            f"pairs in each page, which a hand edit can unbalance:\n{listed}",
        )
        listed = "\n".join(stale)
        self.assertEqual(
            stale, [],
            f"expected every ladder page to carry the current paper; these pages' gate blocks "
            f"differ from render() - check the generator rather than editing the pages by "
            f"hand:\n{listed}",
        )
        self.assertEqual(
            len(rows), len(generator.MODULE_IDS),
            f"expected one row per ladder page ({len(generator.MODULE_IDS)}), got {len(rows)} - "
            f"check scan() still walks every MODULE_IDS entry",
        )
        self.assertTrue(
            all(row["status"] == "current" for row in rows),
            f"expected every row to report status 'current'; these did not: "
            f"{[row for row in rows if row['status'] != 'current']} - check the staleness test",
        )

    def test_every_tier2_page_on_disk_is_on_the_ladder(self):
        on_disk = set()
        for path in sorted((ROOT / "modules").glob("00-foundations.T2.*.md")):
            meta = generator.front_matter(path.read_text(encoding="utf-8"))
            if meta.get("tier") == "2":
                on_disk.add(path.stem)
        self.assertEqual(
            on_disk, set(generator.MODULE_IDS),
            f"expected the Tier 2 pages on disk and MODULE_IDS to be the same set; only on disk: "
            f"{sorted(on_disk - set(generator.MODULE_IDS))}, only listed: "
            f"{sorted(set(generator.MODULE_IDS) - on_disk)} - check a page's `tier: 2` front "
            f"matter, which is what decides membership",
        )


class TestThePaperCoversTheLadder(unittest.TestCase):
    def test_every_declared_concept_is_tagged(self):
        declared = set(generator.ladder_concepts())
        tagged = generator.paper_concepts()
        self.assertEqual(
            declared, tagged,
            f"expected the paper to tag exactly the ladder's concepts; untagged: "
            f"{sorted(declared - tagged)}, tags for nothing: {sorted(tagged - declared)} - check "
            f"the question's `concept` field against _index.yaml",
        )

    def test_question_options_are_well_formed(self):
        for index, question in enumerate(generator.QUESTIONS, start=1):
            if "options" not in question:
                self.assertNotIn(
                    "answer", question,
                    f"expected Q{index}, a free-response question, to carry no answer letter; "
                    f"check the key, since a stray `answer` on it would be keyed against no option",
                )
                continue
            self.assertEqual(
                len(question["options"]), 4,
                f"expected Q{index} to offer four options, got {len(question['options'])} - "
                f"check the option list, since the key indexes into a fixed ABCD",
            )
            self.assertIn(
                question.get("answer"), list("ABCD"),
                f"expected Q{index}'s answer to be one of A/B/C/D, got "
                f"{question.get('answer')!r} - check the key letter, which is not zero-based",
            )

    def test_the_answer_key_runs(self):
        self.assertEqual(
            generator.check_answer_key(), [],
            "expected the answer key to evaluate with no problems; each finding names the "
            "question and what its arithmetic produced - check the formula in QUESTIONS",
        )

    def test_the_right_answer_is_not_always_the_first_option(self):
        # A paper whose every multiple choice keys `A` can be half-guessed without reading the
        # ladder: the key letters must differ, and the key must agree with the option it names.
        letters = [q["answer"] for q in generator.QUESTIONS if "options" in q]
        self.assertGreater(
            len(set(letters)), 2,
            f"expected keys to use at least three of A/B/C/D so the paper cannot be guessed; "
            f"got {sorted(set(letters))} - check the shuffled option order per question",
        )
        for index, question in enumerate(generator.QUESTIONS, start=1):
            if "options" not in question:
                continue
            option = question["options"][list("ABCD").index(question["answer"])]
            self.assertTrue(
                option.strip(),
                f"expected Q{index}'s keyed option to have text, since the key points at "
                f"{question['answer']} and that slot is blank - check the option list order",
            )


class TestTheChecksCatchDrift(unittest.TestCase):
    def test_a_page_without_markers_is_a_finding(self):
        self.assertIsNone(
            generator.block_bounds("### Gate test\n\nno markers here\n"),
            "expected block_bounds to return None for a page with no START/END markers; "
            "returning a span would let a page with no gate block pass as current",
        )

    def test_a_one_character_edit_is_stale(self):
        paper = generator.render()
        edited = paper.replace("$\\pm 10^{-9}$", "$\\pm 10^{-8}$", 1)
        self.assertNotEqual(
            edited, paper,
            "expected the doctoring to change one digit of the paper; it matched nothing, so "
            "the staleness check below would test an unmodified render",
        )
        self.assertIsNotNone(
            generator.block_bounds(edited),
            "expected the markers to survive a one-character edit, so the drift is caught by "
            "the comparison and not by a lost block",
        )

    def test_the_render_is_idempotent(self):
        self.assertEqual(
            generator.render(), generator.render(),
            "expected two renders to produce the same bytes; a difference means the generator "
            "reads something that changes between calls, which makes every page stale at once",
        )

    def test_a_stale_gate_score_outside_the_block_is_a_finding(self):
        page = (ROOT / "modules" / (generator.MODULE_IDS[-1] + ".md")).read_text(encoding="utf-8")
        self.assertEqual(
            generator.score_restatements(page), [],
            f"expected no gate score restated outside the generated block on "
            f"{generator.MODULE_IDS[-1]}; a restated score drifts the moment the paper changes",
        )
        stale = page.replace(
            "## 7. Checkpoint",
            "## 7. Checkpoint\nScore $7/8$ on the Ladder Gate test below.",
            1,
        )
        self.assertEqual(
            generator.score_restatements(stale), ["$7/8$"],
            "expected a hand-written 'Score $7/8$ on the Ladder Gate test' outside the block to "
            "be reported; check the line scan matches the gate's own wording",
        )
        # A page's own Skip-test score is not the gate's and must not be flagged.
        own = page.replace(
            "## 7. Checkpoint",
            "## 7. Checkpoint\nScore $4/5$ on the module Skip test.",
            1,
        )
        self.assertEqual(
            generator.score_restatements(own), [],
            "expected the page's own Skip-test score ($4/5$) to be ignored; flagging it would "
            "make every page with a skip test fail the gate",
        )


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
            self.assertIn(
                generator.START, raw,
                f"expected {ident} to carry the ladder-gate START marker; without it the block "
                f"cannot be stripped and the paper becomes page evidence",
            )
            body = page_body(path)
            self.assertNotIn(
                "ladder-gate", body,
                f"expected page_body() to strip the ladder-gate block from {ident}; a page body "
                f"that keeps it appears to teach the whole ladder to every audit",
            )
            self.assertNotIn(
                generator.QUESTIONS[0]["text"], body,
                f"expected {ident}'s body to lose the paper's first question; if it survives, "
                f"the crosswalk counts the paper as this page's own teaching",
            )

    def test_a_word_the_paper_uses_everywhere_no_longer_looks_taught_everywhere(self):
        # "tustin" is in the paper (Q5), so before stripping all seven pages carried it. A page
        # body is only evidence when the page itself writes the word down.
        carriers = [
            ident for ident in generator.MODULE_IDS
            if "tustin" in page_body(ROOT / "modules" / (ident + ".md")).lower()
        ]
        self.assertLess(
            len(carriers), len(generator.MODULE_IDS),
            f"expected fewer than all {len(generator.MODULE_IDS)} pages to carry 'tustin' once "
            f"the paper is stripped; every page carrying it means the strip stopped working - "
            f"carriers: {carriers}",
        )
        self.assertIn(
            "00-foundations.T2.00f", carriers,
            f"expected the Tustin page to still carry 'tustin' in its own prose, since the strip "
            f"must only remove the paper; carriers were {carriers}",
        )


if __name__ == "__main__":
    unittest.main()
