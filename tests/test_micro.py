#!/usr/bin/env python3
"""The micro-learning build-time contract (`tests/test_micro.py`).

The Node suite owns the reducer and the clocks. This file owns the claims that can only be checked
against the repository: every authored source validates, every anchor exists in its own parent page,
the source-focus phrases still sit inside their section, the generated lesson and parent manifests
are current, the `anchor` block survives into each lesson payload, and every designed activity stays
under the 120-second ceiling.
"""

from __future__ import annotations

import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import generate_micro_lessons as micro  # noqa: E402
import micro_timing as timing  # noqa: E402


class MicroContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = micro.load_sources()
        cls.findings, cls.warnings, cls.context = micro.validate(cls.sources)
        cls.concepts = micro.concepts_of(cls.sources)
        cls.parent_text = {}
        cls.anchors = {}
        for source in cls.sources:
            path = os.path.join(ROOT, source["parentPath"])
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
            cls.parent_text[source["parentPath"]] = text
            cls.anchors[source["parentLessonId"]] = micro.sections(text)

    def test_the_sources_validate(self):
        self.assertEqual(self.findings, [], "expected no micro findings; check the content validator before shipping")

    def test_every_source_names_the_file_it_lives_in(self):
        self.assertGreaterEqual(len(self.sources), 9, "expected P.1 through P.9 to each teach micro lessons")
        for source in self.sources:
            stem = os.path.splitext(os.path.basename(source["_source"]))[0]
            self.assertEqual(
                source["parentLessonId"],
                stem,
                f"expected {source['_source']} to name {stem}; check the parentLessonId",
            )
            self.assertIn(
                source["parentPath"],
                self.parent_text,
                f"expected {source['_source']} to cite a readable parent page",
            )

    def test_all_concepts_in_authored_order(self):
        self.assertEqual(
            [concept["id"] for concept in self.concepts],
            micro.EXPECTED_IDS,
            "expected the authored concepts in order; check the micro/P.<n>.json files",
        )

    def test_every_anchor_is_unique_and_inside_its_own_parent(self):
        for source in self.sources:
            parent_lesson = source["parentLessonId"]
            anchors = self.anchors[parent_lesson]
            self.assertEqual(
                len(anchors),
                len(set(anchors)),
                f"expected unique micro anchors in {parent_lesson}; check for a duplicated heading",
            )
            for concept in source["concepts"]:
                self.assertIn(
                    concept["anchor"],
                    anchors,
                    f"{concept['id']} expected an anchor in {parent_lesson}; check its micro focus heading",
                )
                self.assertTrue(
                    concept["anchor"].startswith("micro-"),
                    f"{concept['id']} expected a micro- anchor namespace; check the {parent_lesson} anchor id",
                )

    def test_every_source_focus_is_in_its_anchored_section(self):
        for source in self.sources:
            anchors = self.anchors[source["parentLessonId"]]
            for concept in source["concepts"]:
                body = anchors[concept["anchor"]]
                for phrase in concept["sourceFocus"]:
                    self.assertIn(
                        phrase,
                        body,
                        f"{concept['id']} expected sourceFocus inside {concept['anchor']}; check the quoted phrase",
                    )

    def test_diagnostics_cannot_be_won_by_a_coin_flip(self):
        for concept in self.concepts:
            self.assertEqual(
                len(concept["diagnostics"]),
                2,
                f"expected two diagnostics for {concept['id']}; check the authored source",
            )
            for diagnostic in concept["diagnostics"]:
                if diagnostic.get("type", "choice") == "choice":
                    self.assertGreaterEqual(
                        len(diagnostic["options"]),
                        4,
                        f"{diagnostic['id']} expected four options; check the diagnostic cannot be guessed",
                    )
                else:
                    self.assertTrue(
                        diagnostic.get("acceptedAnswers"),
                        f"{diagnostic['id']} expected accepted answers; check the short-answer key",
                    )

    def test_every_designed_activity_is_under_two_minutes(self):
        for concept in self.concepts:
            model = timing.modeled(concept)
            for activity in ("learn", "review", "challenge"):
                self.assertLessEqual(
                    model[activity],
                    timing.MAX_DESIGNED_SECONDS,
                    f"{concept['id']} {activity} models {model[activity]:.1f}s; expected under 120 s, check the design",
                )

    def test_the_review_rotation_has_no_repeated_set(self):
        for concept in self.concepts:
            sets = timing.review_sets(concept["reviewPool"])
            self.assertEqual(len(sets), len(set(sets)), f"{concept['id']} expected unique review rotation sets; check the pool order")
            self.assertTrue(
                all(len(row) == timing.REVIEW_SIZE for row in sets),
                "expected every review set to hold two questions; check the rotation helper",
            )

    def test_every_concept_has_a_progressive_walkthrough(self):
        for concept in self.concepts:
            steps = concept.get("walkthrough", [])
            self.assertGreaterEqual(
                len(steps),
                2,
                f"{concept['id']} expected a stepped walkthrough; check the authored source",
            )
            for step in steps:
                code = step.get("code")
                note = step.get("note")
                self.assertIsInstance(
                    code,
                    str,
                    f"{concept['id']} walkthrough expected code text; check the authored source",
                )
                self.assertNotEqual(
                    code.strip(),
                    "",
                    f"{concept['id']} walkthrough expected a code line; check the authored source",
                )
                self.assertIsInstance(
                    note,
                    str,
                    f"{concept['id']} walkthrough expected note text; check the authored source",
                )
                self.assertNotEqual(
                    note.strip(),
                    "",
                    f"{concept['id']} walkthrough expected a note; check the authored source",
                )

    def test_the_generated_bundle_is_current(self):
        output = micro.build(self.sources)
        with open(micro.OUT, encoding="utf-8") as handle:
            current = handle.read()
        self.assertEqual(
            current,
            output,
            "expected the generated micro catalogue; check scripts/generate_micro_lessons.py",
        )
        payload = json.loads(output.split("MICRO_LESSONS: MicroCatalog = ", 1)[1].rstrip(";\n"))
        self.assertEqual(
            [parent["parentLessonId"] for parent in payload["parents"]],
            [source["parentLessonId"] for source in self.sources],
            "expected every parent lesson in the catalogue, in source order",
        )
        for parent in payload["parents"]:
            self.assertEqual(
                parent["conceptIds"],
                [concept["id"] for concept in payload["concepts"] if concept["parentLessonId"] == parent["parentLessonId"]],
                f"{parent['parentLessonId']} expected its concepts under its own parent entry",
            )

    def test_the_parent_manifest_names_every_micro_lesson(self):
        path = os.path.join(ROOT, "app", "src", "data", "parentLessons.json")
        with open(path, encoding="utf-8") as handle:
            manifest = json.load(handle)
        by_id = {lesson["id"]: lesson for lesson in manifest["lessons"]}
        for source in self.sources:
            parent_lesson = source["parentLessonId"]
            self.assertIn(parent_lesson, by_id, f"expected {parent_lesson} in the parent manifest; check the generated parent lessons")
            self.assertEqual(
                by_id[parent_lesson]["path"],
                source["parentPath"],
                f"expected {parent_lesson}'s authored path; check the parent manifest generator",
            )
            self.assertEqual(
                by_id[parent_lesson]["subjectId"],
                "python",
                f"expected {parent_lesson} to be a Python lesson; check the parent manifest mapping",
            )
            self.assertEqual(
                by_id[parent_lesson]["sourceFormat"],
                "markdown",
                f"expected {parent_lesson} to keep markdown format; check the parent manifest mapping",
            )

    def test_the_payloads_keep_the_micro_anchors(self):
        for source in self.sources:
            path = os.path.join(
                ROOT,
                "app",
                "public",
                "lesson-pages",
                source["parentPath"][:-3] + ".json",
            )
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
            self.assertEqual(
                payload["v"],
                6,
                "expected payload v6 so the reader knows anchor blocks exist; check the lesson generator",
            )
            anchors = {block["id"] for block in payload["blocks"] if block.get("t") == "anchor"}
            for concept in source["concepts"]:
                self.assertIn(
                    concept["anchor"],
                    anchors,
                    f"{concept['id']} expected its payload anchor; check the generated lesson block",
                )


if __name__ == "__main__":
    unittest.main()
