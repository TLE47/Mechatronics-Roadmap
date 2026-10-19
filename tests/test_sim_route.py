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

import glob
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
        self.assertEqual(
            gen.render(), self.doc,
            "expected the committed docs/SIM_ROUTE.md to equal what the generator renders from "
            "the pages' own metadata; a difference means an est_hours or tier changed without "
            "the page being regenerated - run python3 scripts/generate_sim_route.py",
        )

    def test_every_module_appears_exactly_once(self):
        """A module in neither table is a module the learner is never told about."""
        on_disk = sorted(row["id"] for row in gen.module_rows())
        self.assertEqual(
            len(on_disk), len(set(on_disk)),
            f"expected module ids to be unique, but {len(on_disk) - len(set(on_disk))} repeat(s) "
            f"mean two pages share an id; check the duplicated stem, since one page would "
            f"silently overwrite the other's hours",
        )
        for ident in on_disk:
            # Count table rows, not prose: the "why optional" section names a moved module a second
            # time on purpose, and a duplicate *row* is what would confuse a learner's route.
            rows = [
                line
                for line in self.doc.splitlines()
                if line.startswith("|") and f"`{ident}`" in line
            ]
            self.assertEqual(
                len(rows), 1,
                f"expected {ident} to appear in exactly one route table row, found {len(rows)}; "
                f"a module in two rows reads as two modules, and one in none is missing from the "
                f"learner's route - check CORE_MODULES and the Extensions table",
            )

    def test_the_core_route_is_a_subset_of_the_modules(self):
        on_disk = {row["id"] for row in gen.module_rows()}
        missing = [ident for ident in gen.CORE_MODULES if ident not in on_disk]
        self.assertEqual(
            missing, [],
            f"expected every Core id to have a page on disk; these are named but do not exist: "
            f"{missing} - check CORE_MODULES against exercises/ and the page filenames",
        )
        self.assertEqual(
            len(gen.CORE_MODULES), len(set(gen.CORE_MODULES)),
            f"expected each Core id once, but {len(gen.CORE_MODULES) - len(set(gen.CORE_MODULES))} "
            f"appear twice - a duplicate inflates the Core total the README quotes",
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
        self.assertIsNotNone(
            match,
            f"expected a `**low-high** |` Core total row in {DOC}; without it the route states "
            f"no total - check the table was not reformatted",
        )
        self.assertAlmostEqual(
            low, float(match.group(1)), places=2,
            msg=f"expected the Core total's low end to sum to {low:.2f} hours from the pages' "
                f"own est_hours; got {float(match.group(1)):.2f} - check CORE_MODULES and the "
                f"track rows against the metadata",
        )
        self.assertAlmostEqual(
            high, float(match.group(2)), places=2,
            msg=f"expected the Core total's high end to sum to {high:.2f} hours from the pages' "
                f"own metadata; got {float(match.group(2)):.2f} - a total that is typed rather "
                f"than summed drifts on the next page edit",
        )

    def test_the_readme_main_claim_is_the_core_route(self):
        """The README may not quote a route total that differs from the generated page, drop the
        link to it, or make the Extensions sound required. Every number is read from SIM_ROUTE so
        this test cannot go stale itself."""
        with open(os.path.join(ROOT, "README.md"), encoding="utf-8") as handle:
            readme = handle.read()

        core = re.search(r"\*\*Core total\*\*.*?\*\*([\d.]+)-([\d.]+)\*\*", self.doc)
        self.assertIsNotNone(
            core,
            f"expected a `**Core total**` figure in {DOC}; without it the README has nothing "
            f"generated to quote - check the route page's totals table",
        )
        quoted = f"{float(core.group(1)):g}–{float(core.group(2)):g} hours"
        self.assertIn(
            quoted,
            readme,
            f"expected README.md to quote the generated Core total {quoted!r} exactly as "
            f"docs/SIM_ROUTE.md states it; check the first-paragraph claim, which is where a "
            f"beginner decides what to finish and goes stale first",
        )

        extensions = re.search(r"\*\*(\d+) modules\*\* \| \*\*([\d.]+)\*\*", self.doc)
        self.assertIsNotNone(
            extensions,
            f"expected an Extensions total row in {DOC}; without it the optional half of the "
            f"route states no size - check the totals table",
        )
        self.assertIn(
            f"{float(extensions.group(2)):g} hours",
            readme,
            f"expected README.md to quote the generated Extensions total "
            f"{extensions.group(2)!r} hours; check the claim against {DOC}, since a mismatched "
            f"optional figure makes the extras look required",
        )
        self.assertIn(
            "docs/SIM_ROUTE.md", readme,
            f"expected README.md to link docs/SIM_ROUTE.md; without the link a learner never "
            f"reaches the page the route is generated into",
        )

        # The counts a newcomer reads must be the generated ones too: a moved module is exactly the
        # change that leaves "42 modules" standing in the first paragraph while the table says 40.
        self.assertIn(
            f"**{len(gen.CORE_MODULES)} modules plus the prose tracks**",
            readme,
            f"expected README.md to state the generated Core module count "
            f"({len(gen.CORE_MODULES)}); check the first paragraph against {DOC}, since a moved "
            f"module is exactly what leaves the old count standing while the table says otherwise",
        )
        tier2 = sum(1 for row in gen.module_rows() if row["id"] in gen.CORE_MODULES and row["tier"] == "2")
        self.assertIn(
            f"{tier2} Tier 2 modules",
            readme,
            f"expected README.md to state the generated Core Tier 2 count ({tier2}); check the "
            f"first paragraph against {DOC}, since the Tier 2 count is the course's own promise",
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
            self.assertIn(
                ident, on_disk,
                f"expected {ident}, named as an optional exception to 'Tier 2 is required', to "
                f"have a page; check OPTIONAL_REASONS against exercises/ and the page filenames",
            )
            self.assertNotIn(
                ident, gen.CORE_MODULES,
                f"expected {ident} to be either required or an exception, not both; being in "
                f"CORE_MODULES and OPTIONAL_REASONS at once leaves the learner no reading that "
                f"is consistent",
            )
            self.assertGreater(
                len(reason.split()), 12,
                f"expected {ident}'s reason to run past 12 words so it justifies moving a Tier 2 "
                f"module off the Core route; got {len(reason.split())} - check the wording, since "
                f"a short reason is a gap with a label",
            )
            self.assertIn(
                f"`{ident}`", self.doc,
                f"expected {ident} to be rendered in {DOC}; an exception the page never mentions "
                f"is invisible to the learner it was written for",
            )

    def test_the_status_field_is_one_of_three_values(self):
        statuses = re.findall(r"\*\*Route status: `([^`]+)`\*\*", self.doc)
        self.assertEqual(
            len(statuses), 1,
            f"expected exactly one route status line, found {len(statuses)}: {statuses} - "
            f"check the `**Route status: `...`**` wording matches in both places",
        )
        self.assertIn(
            statuses[0], gen.STATUS_LEVELS,
            f"expected the page's status {statuses[0]!r} to be one of {gen.STATUS_LEVELS}; "
            f"an unlisted value means the page claims evidence the generator cannot grade",
        )
        self.assertEqual(
            statuses[0], gen.ROUTE_STATUS,
            f"expected the page and the generator to agree on the status; the page says "
            f"{statuses[0]!r} while ROUTE_STATUS is {gen.ROUTE_STATUS!r} - check which one moved",
        )

    def test_pilot_validated_needs_five_outside_participants(self):
        """The gate itself, including the negative case: the value may not be typed in early."""
        self.assertTrue(
            gen.status_findings("pilot-validated", gen.PILOT_MIN_PARTICIPANTS - 1),
            f"expected four participants to be refused, since the gate needs "
            f"{gen.PILOT_MIN_PARTICIPANTS}; a pass here means the threshold is off by one",
        )
        self.assertEqual(
            gen.status_findings("pilot-validated", gen.PILOT_MIN_PARTICIPANTS), [],
            f"expected exactly {gen.PILOT_MIN_PARTICIPANTS} participants to satisfy the gate; a "
            f"finding here means the boundary is exclusive and the bar is secretly higher",
        )
        self.assertTrue(
            gen.status_findings("validated", 99),
            f"expected the invented status 'validated' to be refused however many participants "
            f"are declared; check that membership in STATUS_LEVELS is enforced first",
        )
        self.assertEqual(
            gen.status_findings("author-dogfood", 0), [],
            f"expected 'author-dogfood' with no participants to be fine; it makes no outside "
            f"claim, and flagging it would push the page to overstate its evidence",
        )

    def test_the_declared_participants_match_the_declared_status(self):
        """Whatever the page claims now, docs/pilot-results.md has to back it."""
        declared = gen.participants_from_results()
        self.assertEqual(
            gen.status_findings(gen.ROUTE_STATUS, declared),
            [],
            f"expected docs/SIM_ROUTE.md's status {gen.ROUTE_STATUS!r} to be justified by "
            f"docs/pilot-results.md, which declares {declared} participants; check that page's "
            f"count before raising the route's status, since the claim is only as good as it",
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
            self.assertIn(
                ident, gen.CORE_MODULES,
                f"expected {ident}, one of the four Tier 3 bridges or the capstone, to stay on "
                f"the Core route; moving it to Extensions leaves a learner with the setup half "
                f"and no project to use it in",
            )

    def test_track_p_follows_the_lesson_numbers_not_the_filenames(self):
        """Plain filename order lists P.10 before P.2; the route has to follow the lesson numbers."""
        ids = [row["id"] for row in gen.track_rows("track-p/*.md", "P.M")]
        self.assertEqual(
            ids, sorted(ids, key=gen.lesson_order),
            f"expected Track P rows in lesson-number order, got {ids}",
        )
        self.assertLess(
            self.doc.index("`P.2`"), self.doc.index("`P.10`"),
            "expected P.2 before P.10 in docs/SIM_ROUTE.md; string order puts P.10 first",
        )

    def test_each_track_p_lesson_comes_before_the_one_it_hands_to(self):
        """A lesson's `Next lesson` link names the lesson that depends on it, so the route must list the
        dependent after it. Filename order breaks this at P.9 -> P.10."""
        order = {row["id"]: i for i, row in enumerate(gen.track_rows("track-p/*.md", "P.M"))}
        checked = 0
        for path in sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md"))):
            source = gen.frontmatter(path).get("lesson_id", "")
            with open(path, encoding="utf-8") as handle:
                match = re.search(r"\*\*Next lesson:\*\*.*?\[Lesson (P\.\w+):", handle.read())
            if not match or source not in order or match.group(1) not in order:
                continue
            checked += 1
            self.assertLess(
                order[source], order[match.group(1)],
                f"expected {source} to come before {match.group(1)}, which it hands to; the route "
                f"lists {match.group(1)} first, so a learner meets the dependent lesson too early",
            )
        self.assertGreaterEqual(
            checked, 10,
            f"expected at least 10 Track P hand-offs to check, found {checked}; the Next-lesson "
            f"pattern may have changed",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
