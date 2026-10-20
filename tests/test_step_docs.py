#!/usr/bin/env python3
"""The syllabus, the curriculum map and the nine track READMEs must cost the ten-step spine.

The defects this guards against, all of which existed before `scripts/generate_step_docs.py`:

1. **A cost that is not the pages' cost** - `docs/SYLLABUS.md` quoted 326.5 h while the ten steps
   summed to 200.35-290 from the same metadata.
2. **A second order** - each track README opened on a per-pass table ("Track 01 in the same
   Tier") while the front page promised Steps 1-10.
3. **A stale or stacked block** - a moved page leaving the old hours in place, or a re-run adding
   a second step block to a README.
4. **A depth layer that disappears** - the arm/depth split is the order a learner follows, so each
   track must state its three layers and their hours.

Every assertion message is a literal on purpose: `scripts/lint_assertions.py` cannot read a
formatted message, and the ratchet lets no file start with debt.

Run: `python3 tests/test_step_docs.py` (also discovered by `python3 -m unittest discover`).
"""

import importlib.util
import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")

spec = importlib.util.spec_from_file_location(
    "generate_step_docs_for_tests", os.path.join(SCRIPTS, "generate_step_docs.py")
)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
route_model = generator.route_model


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def facts():
    return route_model.facts()


class SyllabusTests(unittest.TestCase):
    def test_the_ten_step_rows_sum_to_the_quoted_total(self):
        """Every row is a page's own hours; a hand-typed subtotal drifts on the next edit."""
        text = read(generator.SYLLABUS)
        rows = re.findall(r"^\| \*\*(\d+) \u00b7 .*?\| \*\*([\d.]+)-([\d.]+)\*\* \|$", text, re.M)
        self.assertEqual(
            len(rows), 10,
            msg="expected ten step rows with a low-high focused-hours column; a missing row is a "
                "step whose cost nobody can see",
        )
        self.assertEqual(
            [int(row[0]) for row in rows], list(range(1, 11)),
            msg="expected the costed rows to run from Step 1 to Step 10 in order; a gap or a "
                "repeat means one step is missing from the plan",
        )
        low = round(sum(float(row[1]) for row in rows), 2)
        high = round(sum(float(row[2]) for row in rows), 2)
        expected = facts()
        self.assertAlmostEqual(
            low, expected["low"], places=2,
            msg="expected the ten rows to add up to the pages' own low total; a typed subtotal is "
                "how the old 326.5 h figure survived beside a 200 h route",
        )
        self.assertAlmostEqual(
            high, expected["high"], places=2,
            msg="expected the ten rows to add up to the pages' own slow-end total; check that "
                "every step still sums its lesson and module metadata",
        )

    def test_the_arm_and_depth_layers_are_both_costed(self):
        text = read(generator.SYLLABUS)
        expected = facts()
        arm = generator.rng(expected["arm_low"], expected["arm_high"])
        depth = generator.rng(expected["depth_low"], expected["depth_high"])
        self.assertIn(
            arm, text,
            msg="expected the arm route's own total in the syllabus; without it a learner cannot "
                "tell the required hours from the optional ones",
        )
        self.assertIn(
            depth, text,
            msg="expected the depth pass's own total in the syllabus; the optional half has to be "
                "plannable on its own",
        )
        self.assertIn(
            "Depth pass, after Step 10", text,
            msg="expected the depth layer to be named as the second pass in the same step order, "
                "not as a second course with its own numbering",
        )

    def test_the_old_pass_schedule_is_gone(self):
        text = read(generator.SYLLABUS)
        for stale in ("Pass 1", "Pass 2", "Pass 3", "8-Step Teaching Ladder", "Weeks 1\u201311"):
            self.assertNotIn(
                stale, text,
                msg="expected the syllabus to schedule the ten steps instead of the retired pass "
                    "vocabulary that was the second order on the page",
            )

    def test_the_depth_pass_is_shown_as_its_two_tiered_halves(self):
        """Depth 2 is the Tier 2 pass and Depth 3 the Tier 3 pass; the old page split neither."""
        text = read(generator.SYLLABUS)
        expected = facts()
        for heading in ("Depth 2 \u00b7 practice", "Depth 3 \u00b7 derive"):
            self.assertIn(
                heading, text,
                msg="expected the syllabus cost table to name the two depth halves it splits "
                    "a step's optional work into; one column for both is the gap this closes",
            )
        for label, low_key, high_key in (
            ("Depth 2 pass", "depth2_low", "depth2_high"),
            ("Depth 3 pass", "depth3_low", "depth3_high"),
        ):
            row = next(
                (line for line in text.splitlines() if line.startswith(f"| **{label}, after Step 10**")),
                None,
            )
            self.assertIsNotNone(
                row,
                msg="expected a totals row for each depth half in the syllabus; without it the "
                    "per-step split cannot be checked against one sum",
            )
            self.assertIn(
                generator.rng(expected[low_key], expected[high_key]), row,
                msg="expected each depth totals row to carry the model's own sum for that tier, "
                    "not a typed subtotal",
            )
        for step in expected["steps"]:
            row = next(
                (line for line in text.splitlines() if line.startswith(f"| **{step['number']} \u00b7 ")),
                None,
            )
            self.assertIsNotNone(
                row,
                msg="expected every step to have a cost row in the syllabus table; a missing row "
                    "is a step whose depth split nobody can read",
            )
            for low_key, high_key, count in (
                ("depth2_low", "depth2_high", len(step["depth2_modules"])),
                ("depth3_low", "depth3_high", len(step["depth3_modules"])),
            ):
                if not count:
                    continue
                self.assertIn(
                    generator.rng(step[low_key], step[high_key]), row,
                    msg="expected each step row to price each depth half from its own modules; "
                        "a shared depth figure is what the two columns exist to replace",
                )

    def test_the_tier3_two_level_contract_survives(self):
        """`tests/test_module_parity.py` cites this page for the Level A / Level B split."""
        text = read(generator.SYLLABUS)
        for heading in ("Use & Understand", "Derive & Extend"):
            self.assertIn(
                heading, text,
                msg="expected the syllabus to keep the Tier 3 two-level contract; module parity "
                    "points here for what a Tier 3 page must carry",
            )


class CurriculumTests(unittest.TestCase):
    def test_every_step_has_a_row_with_its_hours(self):
        text = read(generator.CURRICULUM)
        for step in facts()["steps"]:
            self.assertIn(
                f"| {step['number']} |", text,
                msg="expected a map row for every step; the folder and id table must cover all "
                    "ten, not just the ones with a module",
            )
            self.assertIn(
                generator.rng(step["low"], step["high"]), text,
                msg="expected each step's own hours in the map; a step without a cost is the gap "
                    "this page closes",
            )

    def test_every_track_states_all_three_layers(self):
        text = read(generator.CURRICULUM)
        for folder in generator.TRACKS:
            heading = generator.track_title(folder).replace(f"Track {folder[:2]}: ", "")
            row = next(
                (line for line in text.splitlines() if line.startswith(f"| **{heading}** |")),
                None,
            )
            self.assertIsNotNone(
                row,
                msg="expected a depth row for every track README in the per-track layer table; a "
                    "missing row hides that track's layers and hours",
            )
            self.assertEqual(
                row.count("|"), 8,
                msg="expected each track row to carry track, step, both depth halves and the "
                    "outside pages; a wrong cell count means the table will render short",
            )


class TrackReadmeTests(unittest.TestCase):
    def test_each_track_readme_carries_one_block_for_its_step(self):
        owner = generator.step_of_track()
        for index, folder in enumerate(generator.TRACKS):
            text = read(os.path.join(ROOT, folder, "README.md"))
            with self.subTest(folder=folder):
                self.assertEqual(
                    text.count(generator.OPEN), 1,
                    msg="expected exactly one generated step block per track README; zero leaves "
                        "the old pass table in place and two means a re-run stacked a block",
                )
                self.assertEqual(
                    text.count(generator.CLOSE), 1,
                    msg="expected exactly one block end marker per track README; a mismatch means "
                        "the markers were edited by hand",
                )
                step = generator.step_by_number(owner[index] + 1)
                self.assertIn(
                    "Step %d of %d \u00b7 %s" % (step["number"], facts()["step_count"], step["title"]),
                    text,
                    msg="expected every track README to name its own step and title; a track that "
                        "does not say where it sits is back on the second order",
                )
                self.assertIn(
                    generator.rng(step["low"], step["high"]), text,
                    msg="expected every track README to cost its step in focused hours; the "
                        "number must match the pages' metadata",
                )

    def test_the_three_depth_layers_are_all_named(self):
        for folder in generator.TRACKS:
            text = read(os.path.join(ROOT, folder, "README.md"))
            for label in ("1 \u00b7 arm", "2 \u00b7 practice", "3 \u00b7 derive", "outside both routes"):
                self.assertIn(
                    label, text,
                    msg="expected every track README to name both depth halves and the pages "
                        "outside both routes; the per-track split is what the ten steps keep",
                )

    def test_an_unlisted_tier3_page_is_outside_both_routes_not_a_depth(self):
        """Track 01's Tier 3 page is neither required nor in its step's `optional` list."""
        text = read(os.path.join(ROOT, "01-electronics-and-power", "README.md"))
        outside = next(
            (line for line in text.splitlines() if line.startswith("| **outside both routes** |")),
            None,
        )
        self.assertIsNotNone(
            outside,
            msg="expected Track 01 to carry the outside-both-routes row its Tier 3 page belongs in",
        )
        self.assertIn(
            "01-electronics.T3.01a", outside,
            msg="expected the track page to cost the Tier 3 page the step never required; "
                "listing only step-level `optional` pages hid it from the table",
        )

    def test_a_track_readme_without_markers_or_the_old_table_is_an_error(self):
        with self.assertRaises(SystemExit):
            generator.splice("# Track 99: fixture\n\n## A section\n", "block", "fixture")

    def test_a_second_render_replaces_the_block_instead_of_stacking(self):
        text = read(os.path.join(ROOT, "00-foundations", "README.md"))
        block = generator.OPEN + "\none\n" + generator.CLOSE
        once = generator.splice(text, block, "fixture")
        twice = generator.splice(once, block, "fixture")
        self.assertEqual(
            twice, once,
            msg="expected a re-render to replace the block in place rather than grow a second "
                "copy of the step table",
        )

    def test_the_old_navigation_table_migrates_once(self):
        text = read(os.path.join(ROOT, "04-embedded-and-realtime", "README.md"))
        legacy = text.split(generator.OPEN, 1)[0] + generator.LEGACY_HEADING + (
            " (Follow Your Current Pass)\n\n| Pass / Level | Next |\n\n---\n\n## Tier 1\n\nbody\n"
        )
        block = generator.OPEN + "\nblock\n" + generator.CLOSE
        migrated = generator.splice(legacy, block, "fixture")
        self.assertIn(
            block, migrated,
            msg="expected the migration to place the generated block where the old navigation "
                "table stood, not to leave both tables on the page",
        )
        self.assertIn(
            "## Tier 1\n\nbody", migrated,
            msg="expected the migration to keep the teaching sections below the replaced table; "
                "dropping them would lose the page's prose",
        )
        self.assertNotIn(
            "| Pass / Level | Next |", migrated,
            msg="expected the retired pass table to be gone after the migration; a left-over copy "
                "is the second order this generator replaces",
        )


class GeneratorTests(unittest.TestCase):
    def test_check_mode_is_clean(self):
        self.assertEqual(
            generator.main(["--check"]), 0,
            msg="expected the syllabus, the map and the track READMEs to equal what the generator "
                "renders; a stale page means a moved page did not move its hours",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
