#!/usr/bin/env python3
"""Tests for `docs/SIM_ROUTE.md` and its generator.

The route document is the one page a beginner is asked to follow, so the failures that matter are:

1. **Staleness** - a module's `est_hours` changes and the published totals keep the old numbers.
2. **Loss** - a module exists on disk but appears in neither the Core table nor Extensions, so a
   learner never sees it and the route silently claims to be complete.
3. **Invention** - a Core total that is not the sum of the pages' own metadata.

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
            occurrences = len(re.findall(r"`%s`" % re.escape(ident), self.doc))
            self.assertEqual(occurrences, 1, f"{ident} appears {occurrences} times in SIM_ROUTE.md")

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
