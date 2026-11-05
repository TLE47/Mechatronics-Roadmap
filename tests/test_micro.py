#!/usr/bin/env python3
"""The micro-learning build-time contract (`tests/test_micro.py`).

The Node suite owns the reducer and the clocks. This file owns the claims that can only be checked
against the repository: the authored source validates, every anchor exists in the parent page, the
source-focus phrases still sit inside their section, the generated lesson and parent manifests are
current, the `anchor` block survives into the lesson payload, and every designed activity stays under
the 120-second ceiling.
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
        cls.source = micro.load_source()
        cls.findings, cls.warnings, cls.context = micro.validate(cls.source)
        cls.concepts = cls.source["concepts"]
        with open(os.path.join(ROOT, cls.source["parentPath"]), encoding="utf-8") as handle:
            cls.parent = handle.read()
        cls.anchors = micro.sections(cls.parent)

    def test_the_source_validates(self):
        self.assertEqual(self.findings, [], "expected no micro findings; check the content validator before shipping")

    def test_seven_concepts_in_order(self):
        self.assertEqual(
            [concept["id"] for concept in self.concepts],
            micro.EXPECTED_IDS,
            "expected the seven P.1 concepts in authored order; check micro/P.1.json",
        )

    def test_every_anchor_is_unique_and_inside_p1(self):
        self.assertEqual(
            len(self.anchors),
            len(set(self.anchors)),
            "expected unique micro anchors in P.1; check for a duplicated heading",
        )
        for concept in self.concepts:
            self.assertIn(concept["anchor"], self.anchors, f"{concept['id']} expected a parent anchor; check the P.1 micro focus heading")
            self.assertTrue(
                concept["anchor"].startswith("micro-"),
                "expected a micro- anchor namespace; check the P.1 anchor id",
            )

    def test_every_source_focus_is_in_its_anchored_section(self):
        for concept in self.concepts:
            body = self.anchors[concept["anchor"]]
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
                "expected two diagnostics per concept; check micro/P.1.json",
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

    def test_the_generated_bundle_is_current(self):
        output = micro.build(self.source)
        with open(micro.OUT, encoding="utf-8") as handle:
            current = handle.read()
        self.assertEqual(
            current,
            output,
            "expected the generated micro catalogue; check scripts/generate_micro_lessons.py",
        )

    def test_the_parent_manifest_names_p1(self):
        path = os.path.join(ROOT, "app", "src", "data", "parentLessons.json")
        with open(path, encoding="utf-8") as handle:
            manifest = json.load(handle)
        by_id = {lesson["id"]: lesson for lesson in manifest["lessons"]}
        self.assertIn("P.1", by_id, "expected P.1 in the parent manifest; check the generated parent lessons")
        self.assertEqual(
            by_id["P.1"]["path"],
            self.source["parentPath"],
            "expected P.1's authored path; check the parent manifest generator",
        )
        self.assertEqual(
            by_id["P.1"]["subjectId"],
            "python",
            "expected P.1 to be a Python lesson; check the parent manifest mapping",
        )
        self.assertEqual(
            by_id["P.1"]["sourceFormat"],
            "markdown",
            "expected P.1 to keep markdown format; check the parent manifest mapping",
        )

    def test_the_payload_keeps_the_micro_anchors(self):
        path = os.path.join(
            ROOT,
            "app",
            "public",
            "lesson-pages",
            self.source["parentPath"][:-3] + ".json",
        )
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        self.assertEqual(
            payload["v"],
            6,
            "expected payload v6 so the reader knows anchor blocks exist; check the lesson generator",
        )
        anchors = {block["id"] for block in payload["blocks"] if block.get("t") == "anchor"}
        for concept in self.concepts:
            self.assertIn(concept["anchor"], anchors, f"{concept['id']} expected its payload anchor; check the generated lesson block")


if __name__ == "__main__":
    unittest.main()
