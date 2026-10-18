#!/usr/bin/env python3
"""Tests for `docs/SIM_ROUTE.md` and its generator.

The route document is the one page a beginner is asked to follow, so the failures that matter are:

1. **Staleness** - a module's `est_hours` changes and the published totals keep the old numbers.
2. **Loss** - a module exists on disk but appears in neither the Core table nor Extensions, so a
   learner never sees it and the route silently claims to be complete.
3. **Invention** - a Core total that is not the sum of the pages' own metadata.
4. **Drift into the README** - the front page quoting a total, or a requirement, the route page
   does not say: the README's main claim is the one place a beginner decides what to finish.
5. **An unsupported evidence claim** - the route saying `pilot-validated` without the participants
   that would justify it. The status field is the only place the page talks about evidence, so it
   must not be typable ahead of the facts.

Run: `python3 tests/test_sim_route.py` (also wired into the CI verify step).
"""

import importlib.util
import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERATOR = os.path.join(ROOT, "scripts", "generate_sim_route.py")
DOC = os.path.join(ROOT, "docs", "SIM_ROUTE.md")

spec = importlib.util.spec_from_file_location("generate_sim_route", GENERATOR)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


class SimRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(DOC, encoding="utf-8") as handle:
            cls.doc = handle.read()

    def test_the_published_document_matches_the_pages(self):
        """The committed doc is what the generator renders now - no stale hours, no stale tiers."""
        self.assertEqual(gen.render(), self.doc, "docs/SIM_ROUTE.md is stale; regenerate it")

    def test_every_module_appears_exactly_once(self):
        """A module in neither table is a module the learner is never told about."""
        on_disk = sorted(row["id"] for row in gen.module_rows())
        self.assertEqual(len(on_disk), len(set(on_disk)), "two module pages share one id")
        for ident in on_disk:
            # Count table rows, not prose: the "why optional" section names a moved module a second
            # time on purpose, and a duplicate *row* is what would confuse a learner's route.
            rows = [
                line
                for line in self.doc.splitlines()
                if line.startswith("|") and f"`{ident}`" in line
            ]
            self.assertEqual(len(rows), 1, f"{ident} is in {len(rows)} route table rows")

    def test_the_core_route_is_a_subset_of_the_modules(self):
        on_disk = {row["id"] for row in gen.module_rows()}
        missing = [ident for ident in gen.CORE_MODULES if ident not in on_disk]
        self.assertEqual(missing, [], f"Core route names modules that do not exist: {missing}")
        self.assertEqual(
            len(gen.CORE_MODULES), len(set(gen.CORE_MODULES)), "a module is listed twice in Core"
        )

    def test_the_core_total_is_the_sum_of_its_pages(self):
        """Independently from the renderer: sum `est_hours` for the Core ids and compare the line."""
        low = high = 0.0
        for row in gen.module_rows():
            if row["id"] in set(gen.CORE_MODULES):
                low += row["low"]
                high += row["high"]
        for _label, pattern, stop_before in gen.CORE_TRACKS:
            for row in gen.track_rows(pattern, stop_before):
                low += row["low"]
                high += row["high"]
        match = re.search(r"\*\*([\d.]+)-([\d.]+)\*\* \|", self.doc)
        self.assertIsNotNone(match, "SIM_ROUTE.md has no Core total row")
        self.assertAlmostEqual(low, float(match.group(1)), places=2)
        self.assertAlmostEqual(high, float(match.group(2)), places=2)

    def test_the_readme_main_claim_is_the_core_route(self):
        """The README may not quote a route total that differs from the generated page, drop the
        link to it, or make the Extensions sound required. Every number is read from SIM_ROUTE so
        this test cannot go stale itself."""
        with open(os.path.join(ROOT, "README.md"), encoding="utf-8") as handle:
            readme = handle.read()

        core = re.search(r"\*\*Core total\*\*.*?\*\*([\d.]+)-([\d.]+)\*\*", self.doc)
        self.assertIsNotNone(core, "SIM_ROUTE.md has no Core total row")
        quoted = f"{float(core.group(1)):g}–{float(core.group(2)):g} hours"
        self.assertIn(
            quoted,
            readme,
            f"README.md must quote the generated Core total '{quoted}' from docs/SIM_ROUTE.md",
        )

        extensions = re.search(r"\*\*(\d+) modules\*\* \| \*\*([\d.]+)\*\*", self.doc)
        self.assertIsNotNone(extensions, "SIM_ROUTE.md has no Extensions total row")
        self.assertIn(
            f"{float(extensions.group(2)):g} hours",
            readme,
            f"README.md must quote the generated Extensions total '{extensions.group(2)} hours'",
        )
        self.assertIn("docs/SIM_ROUTE.md", readme, "README.md must link the generated route page")

        # The counts a newcomer reads must be the generated ones too: a moved module is exactly the
        # change that leaves "42 modules" standing in the first paragraph while the table says 40.
        self.assertIn(
            f"**{len(gen.CORE_MODULES)} modules plus the prose tracks**",
            readme,
            f"README.md must state the generated Core module count ({len(gen.CORE_MODULES)})",
        )
        tier2 = sum(1 for row in gen.module_rows() if row["id"] in gen.CORE_MODULES and row["tier"] == "2")
        self.assertIn(
            f"{tier2} Tier 2 modules",
            readme,
            f"README.md must state the generated Core Tier 2 count ({tier2})",
        )

        self.assertRegex(
            readme,
            r"(?s)Extensions.{0,400}?optional",
            "README.md must say the Extensions are optional",
        )

    def test_every_optional_module_is_real_and_justified(self):
        """An exception to "Tier 2 is required" has to name a module that exists, is not in Core, and
        comes with a reason long enough to be one — otherwise the exception is just a gap."""
        on_disk = {row["id"] for row in gen.module_rows()}
        for ident, reason in gen.OPTIONAL_REASONS.items():
            self.assertIn(ident, on_disk, f"{ident} is listed as an optional exception but has no page")
            self.assertNotIn(ident, gen.CORE_MODULES, f"{ident} is both required and optional")
            self.assertGreater(len(reason.split()), 12, f"{ident}'s reason is too short to justify the move")
            self.assertIn(f"`{ident}`", self.doc, f"{ident} is not rendered in SIM_ROUTE.md")

    def test_the_status_field_is_one_of_three_values(self):
        statuses = re.findall(r"\*\*Route status: `([^`]+)`\*\*", self.doc)
        self.assertEqual(len(statuses), 1, f"expected one route status line, found {statuses}")
        self.assertIn(statuses[0], gen.STATUS_LEVELS)
        self.assertEqual(statuses[0], gen.ROUTE_STATUS, "the page and the generator disagree on status")

    def test_pilot_validated_needs_five_outside_participants(self):
        """The gate itself, including the negative case: the value may not be typed in early."""
        self.assertTrue(
            gen.status_findings("pilot-validated", gen.PILOT_MIN_PARTICIPANTS - 1),
            "four participants must not support `pilot-validated`",
        )
        self.assertEqual(gen.status_findings("pilot-validated", gen.PILOT_MIN_PARTICIPANTS), [])
        self.assertTrue(gen.status_findings("validated", 99), "the field may not invent a fourth value")
        self.assertEqual(gen.status_findings("author-dogfood", 0), [])

    def test_the_declared_participants_match_the_declared_status(self):
        """Whatever the page claims now, docs/pilot-results.md has to back it."""
        declared = gen.participants_from_results()
        self.assertEqual(
            gen.status_findings(gen.ROUTE_STATUS, declared),
            [],
            f"docs/SIM_ROUTE.md claims `{gen.ROUTE_STATUS}` while pilot-results.md declares {declared} participants",
        )

    def test_the_depth_line_is_required(self):
        """The four Tier 3 bridges and one capstone are the point of the Core route; losing any of
        them (say by classifying the ESKF reset as an extension) would leave a beginner with the
        covariance half and no filter to use it in."""
        for ident in (
            "05-control.T3.05a",
            "05-control.T3.05b",
            "05-control.T3.05c",
            "08-capstones.T3.07a",
        ):
            self.assertIn(ident, gen.CORE_MODULES, f"{ident} must stay on the Core route")


if __name__ == "__main__":
    unittest.main(verbosity=2)
