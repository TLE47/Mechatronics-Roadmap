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
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERATOR = os.path.join(ROOT, "scripts", "generate_sim_route.py")
DOC = os.path.join(ROOT, "docs", "SIM_ROUTE.md")
DEPTH = os.path.join(ROOT, "docs", "DEPTH.md")
MINIMUM = os.path.join(ROOT, "docs", "MINIMUM.md")

spec = importlib.util.spec_from_file_location("generate_sim_route", GENERATOR)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


class SimRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(DOC, encoding="utf-8") as handle:
            cls.doc = handle.read()
        with open(gen.README, encoding="utf-8") as handle:
            cls.readme = handle.read()
        with open(DEPTH, encoding="utf-8") as handle:
            cls.depth = handle.read()

    def test_the_published_document_matches_the_pages(self):
        """The committed doc is what the generator renders now - no stale hours, no stale tiers."""
        self.assertEqual(
            gen.render(), self.doc,
            "expected the committed docs/SIM_ROUTE.md to equal what the generator renders from "
            "the pages' own metadata; a difference means an est_hours or tier changed without "
            "the page being regenerated - run python3 scripts/generate_sim_route.py",
        )

    def test_the_arm_route_contains_only_arm_work(self):
        """SIM_ROUTE is the arm route; every row on it is arm work and no depth row appears."""
        self.assertIn(
            "## Arm route (required)", self.doc,
            "expected the route's section heading to name the arm and nothing else; a combined "
            "heading lets the depth rows read as required before the arm",
        )
        self.assertIn(
            "**· arm**", self.doc,
            "expected arm module rows to be labelled; an unlabelled Tier 1 row leaves the "
            "reader guessing which modules finish the arm",
        )
        self.assertNotIn(
            "**· depth**", self.doc,
            "expected no depth row in the arm route; that row belongs in docs/DEPTH.md",
        )
        self.assertNotIn(
            "T2.", self.doc,
            "expected no Tier 2 module in the arm route; a depth row here makes the arm route "
            "look like it requires optional work",
        )
        self.assertIn(
            "Arm route total", self.doc,
            "expected the arm's own total on the route page, so a learner can stop there without "
            "reading the depth pass as unfinished business",
        )

    def test_the_depth_document_is_generated_with_its_own_total(self):
        """DEPTH.md is the second route: 23 modules, 80 hours, no lessons."""
        self.assertEqual(
            gen.render_depth(), self.depth,
            "expected docs/DEPTH.md to equal what the generator renders; run "
            "scripts/generate_sim_route.py",
        )
        self.assertIn(
            "**Depth pass total**", self.depth,
            "expected the depth page to state its own total; without it the pass has no finish line",
        )
        facts = gen.depth_facts()
        self.assertIn(
            f"**{facts['module_count']} modules**", self.depth,
            f"expected the depth page to count its own {facts['module_count']} modules",
        )
        self.assertIn(
            f"**{gen.fmt(facts['low'], facts['high'])}** |", self.depth,
            f"expected the depth total row to carry {gen.fmt(facts['low'], facts['high'])}, the "
            f"sum of its own pages",
        )

    def test_the_arm_and_depth_routes_are_disjoint_and_cover_every_core_module(self):
        """One module is either arm work or depth work; no page may be in both totals."""
        arm = set(gen.ARM_MODULES)
        depth = set(gen.DEPTH_MODULES)
        self.assertEqual(
            sorted(arm & depth), [],
            f"expected no module in both the arm route and the depth pass, found "
            f"{sorted(arm & depth)}; a module in both totals is double-counted",
        )
        self.assertEqual(
            sorted(arm | depth), sorted(set(gen.CORE_MODULES)),
            "expected the arm and depth sets to cover every Core module exactly once; "
            "otherwise a page belongs to neither route",
        )
        self.assertEqual(
            len(arm), gen.route_model.facts()["arm_module_count"],
            f"expected ARM_MODULES to match the step model's {gen.route_model.facts()['arm_module_count']} "
            f"arm modules, got {len(arm)}",
        )
        self.assertEqual(
            len(depth), gen.route_model.facts()["depth_module_count"],
            f"expected DEPTH_MODULES to match the step model's "
            f"{gen.route_model.facts()['depth_module_count']} depth modules, got {len(depth)}",
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
                for line in (self.doc + self.depth).splitlines()
                if line.startswith("|") and f"`{ident}`" in line
            ]
            self.assertEqual(
                len(rows), 1,
                f"expected {ident} to appear in exactly one route table row across the arm "
                f"route and the depth pass, found {len(rows)}; a module in two rows reads as two "
                f"modules, and one in neither is missing from the learner's route - check "
                f"CORE_MODULES and the Extensions table",
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

    def test_the_arm_total_is_the_sum_of_its_pages(self):
        """Independently from the renderer: sum the arm ids and compare the total row."""
        low = high = 0.0
        for row in gen.module_rows():
            if row["id"] in set(gen.ARM_MODULES):
                low += row["low"]
                high += row["high"]
        for _label, pattern, stop_before in gen.CORE_TRACKS:
            for row in gen.track_rows(pattern, stop_before):
                low += row["low"]
                high += row["high"]
        total_line = next(
            (line for line in self.doc.splitlines() if "**Arm route total**" in line), None
        )
        self.assertIsNotNone(
            total_line,
            f"expected an `**Arm route total**` row in {DOC}; without it the route states no "
            f"total - check the table was not reformatted",
        )
        match = re.search(r"\*\*([\d.]+)-([\d.]+)\*\*", total_line)
        self.assertIsNotNone(
            match,
            f"expected the arm total row to carry a `low-high` figure; got {total_line!r}",
        )
        self.assertAlmostEqual(
            low, float(match.group(1)), places=2,
            msg=f"expected the arm total's low end to sum to {low:.2f} hours from the pages' "
                f"own est_hours; got {float(match.group(1)):.2f} - check ARM_MODULES and the "
                f"track rows against the metadata",
        )
        self.assertAlmostEqual(
            high, float(match.group(2)), places=2,
            msg=f"expected the arm total's high end to sum to {high:.2f} hours from the pages' "
                f"own metadata; got {float(match.group(2)):.2f} - a total that is typed rather "
                f"than summed drifts on the next page edit",
        )

    def test_the_readme_main_claim_is_the_core_route(self):
        """The README may not quote a route total that differs from the generated page, drop the
        link to it, or make the Extensions sound required. Every number is read from SIM_ROUTE so
        this test cannot go stale itself."""
        with open(os.path.join(ROOT, "README.md"), encoding="utf-8") as handle:
            readme = handle.read()

        arm = re.search(r"\*\*Arm route total\*\*.*?\*\*([\d.]+)-([\d.]+)\*\*", self.doc)
        self.assertIsNotNone(
            arm,
            f"expected an `**Arm route total**` figure in {DOC}; without it the README has "
            f"nothing generated to quote - check the route page's totals table",
        )
        quoted = gen.friendly_range(float(arm.group(1)), float(arm.group(2))) + " focused hours"
        self.assertIn(
            quoted,
            readme,
            f"expected README.md to quote the generated arm plan figure {quoted!r}, rounded from "
            f"docs/SIM_ROUTE.md's exact total; check the first three lines, which is where a "
            f"beginner decides what to finish and goes stale first",
        )

        extensions = [
            row for row in gen.module_rows() if row["id"] not in set(gen.CORE_MODULES)
        ]
        ext_hours = gen.fmt(
            round(sum(row["low"] or 0.0 for row in extensions), 2),
            round(sum(row["high"] or 0.0 for row in extensions), 2),
        )
        self.assertIn(
            f"{ext_hours} focused hours",
            readme,
            f"expected README.md to quote the generated Extensions total {ext_hours!r} focused "
            f"hours; check the claim against the pages, since a mismatched optional figure makes "
            f"the extras look required",
        )
        for link in ("docs/SIM_ROUTE.md", "docs/DEPTH.md", "docs/MINIMUM.md", "docs/EXTENSIONS.md"):
            self.assertIn(
                link, readme,
                f"expected README.md to link {link}; the learner needs the arm route, the depth "
                f"pass, the minimum finish and the optional modules as separate doors",
            )

        # The counts a newcomer reads must be the generated ones too: a moved module is exactly the
        # change that leaves an old count standing while the table says otherwise.
        split = gen.route_model.facts()
        self.assertIn(
            f"<!-- sim-route:modules -->**{split['arm_module_count']} arm + "
            f"{split['depth_module_count']} depth modules**<!-- /sim-route -->",
            readme,
            f"expected README.md's module marker to carry the arm/depth split "
            f"({split['arm_module_count']} + {split['depth_module_count']}); a hand-typed count "
            f"is what drifts when a module moves",
        )
        step_facts = gen.route_model.facts()
        self.assertIn(
            f"<!-- route:lessons -->{step_facts['lesson_count']}<!-- /route -->",
            readme,
            f"expected README.md's lesson-count marker to carry the generated total "
            f"({step_facts['lesson_count']}); the table and the prose must agree",
        )

        self.assertRegex(
            readme,
            r"(?s)optional modules.{0,300}?outside the route",
            "README.md must say the optional modules sit outside the route, so a newcomer does not "
            "read them as required work",
        )
        self.assertIn(
            "docs/EXTENSIONS.md",
            readme,
            "expected README.md to link docs/EXTENSIONS.md, where the optional modules and the "
            "ROS 2 escape hatch are explained; check the optional-modules paragraph",
        )

    def test_the_readme_figures_are_generated_from_the_route(self):
        """The front page quotes the Core hours and the Tier 2 requirement; both are rendered here.

        The failure this locks out: `est_hours` moves, `docs/SIM_ROUTE.md` is regenerated, and the
        README keeps yesterday's total — or a step says 18 required modules while the route lists
        20. `--check` now compares the README too, so a hand edit cannot survive CI.
        """
        self.assertEqual(
            gen.render_readme(self.readme), self.readme,
            "expected README's marked figures to equal what the generator renders from the pages; "
            "check the hours range, module count and optional total against docs/SIM_ROUTE.md, "
            "since a hand edit makes the front page disagree with the route it links",
        )

    def test_the_readme_carries_the_generated_figures(self):
        self.assertEqual(
            (self.readme.count("<!-- sim-route:hours -->"),
             self.readme.count("<!-- sim-route:full-hours -->"),
             self.readme.count("<!-- sim-route:depth-hours -->"),
             self.readme.count("<!-- sim-route:modules -->"),
             self.readme.count("<!-- sim-route:extensions -->")),
            (1, 1, 1, 1, 1),
            "expected one arm-hours marker, one full-hours marker, one depth-hours marker, one "
            "module marker and one optional-total marker; a missing marker silently removes "
            "that figure from generation, which is how a stale total survives next to a generated one",
        )
        self.assertEqual(
            (self.readme.count("<!-- sim-route:minimum -->"),
             self.readme.count("<!-- sim-route:minimum-pages -->")),
            (1, 1),
            "expected the minimum finish's page count and focused hours to be generated too; "
            "a hand-typed minimum total is the first number to drift when a page moves",
        )

    def test_a_stale_figure_is_rewritten_not_left_alone(self):
        current = f"**{gen.friendly_range(gen.route_facts()['low'], gen.route_facts()['high'])} focused hours**"
        doctored = self.readme.replace(current, "**175.5–220.5 hours**", 1)
        fixed = gen.render_readme(doctored)
        self.assertNotEqual(
            fixed, doctored,
            "expected the generator to rewrite a stale hours figure between its markers; otherwise "
            "--check passes while the README still quotes the old range",
        )
        self.assertNotIn(
            "175.5", fixed,
            "expected the old range to be gone after rendering, because the marker's job is to "
            "replace the figure, not merely to sit beside it",
        )

    def test_the_route_total_row_is_the_number_the_readme_quotes(self):
        facts = gen.route_facts()
        hours = gen.fmt(facts["low"], facts["high"])
        self.assertIn(
            f"**{hours}** |", self.doc,
            f"expected the Core total row in docs/SIM_ROUTE.md to carry {hours!r}, the same sum "
            f"route_facts() gives the README; two summations mean two chances to disagree",
        )
        self.assertIn(
            f"**{gen.friendly_range(facts['low'], facts['high'])} focused hours**", self.readme,
            f"expected README.md's first-line total to quote the rounded plan figure built from "
            f"{hours!r}; check generate_sim_route.py and docs/SIM_ROUTE.md",
        )

    def test_step_ranges_are_whole_hours_that_add_up(self):
        """One allocation feeds both documents, and its parts sum to the rounded total."""
        rounded = gen.rounded_step_ranges()
        facts = gen.route_facts()
        self.assertEqual(
            sum(low for low, _ in rounded.values()), int(facts["low"] + 0.5),
            f"expected the ten rounded low ends to sum to {facts['low']!r} rounded, got "
            f"{sum(low for low, _ in rounded.values())}; otherwise the table does not add up",
        )
        self.assertEqual(
            sum(high for _, high in rounded.values()), int(facts["high"] + 0.5),
            f"expected the ten rounded high ends to sum to {facts['high']!r} rounded, got "
            f"{sum(high for _, high in rounded.values())}; otherwise the table does not add up",
        )
        for step in gen.route_model.facts()["steps"]:
            low, high = rounded[str(step["number"])]
            self.assertIn(
                low, (int(step["arm_low"]), int(step["arm_low"]) + 1),
                f"expected Step {step['number']}'s exact arm low {step['arm_low']!r} to round to "
                f"within an hour; got {low} - check rounded_step_ranges",
            )
            self.assertIn(
                high, (int(step["arm_high"]), int(step["arm_high"]) + 1),
                f"expected Step {step['number']}'s exact arm high {step['arm_high']!r} to round "
                f"to within an hour; got {high} - check rounded_step_ranges",
            )
        for low, high in rounded.values():
            self.assertIn(
                f"≈{low}–{high}", self.readme,
                f"expected the README step table to carry ≈{low}–{high}, the same allocation "
                f"docs/SIM_ROUTE.md renders",
            )
            self.assertIn(
                f"≈{low}–{high}", self.doc,
                f"expected docs/SIM_ROUTE.md's stage row to carry ≈{low}–{high}, so a reader "
                f"cannot find two ranges for the same step",
            )

    def test_the_required_module_count_is_the_route_count(self):
        """No pinned literal: the route is the only expectation, so moving a module needs one edit."""
        split = gen.route_model.facts()
        self.assertIn(
            f"<!-- sim-route:modules -->**{split['arm_module_count']} arm + "
            f"{split['depth_module_count']} depth modules**<!-- /sim-route -->", self.readme,
            f"expected README.md to carry the route's own arm/depth split "
            f"({split['arm_module_count']} + {split['depth_module_count']}); a hand-typed 42 is "
            f"exactly the drift the marker exists to stop",
        )
        self.assertEqual(
            split["arm_module_count"] + split["depth_module_count"], len(gen.CORE_MODULES),
            "expected every Core module to be in exactly one layer; otherwise the split hides a "
            "module the route still requires",
        )

    def test_the_minimum_document_matches_the_pages(self):
        with open(MINIMUM, encoding="utf-8") as handle:
            committed = handle.read()
        self.assertEqual(
            gen.render_minimum(), committed,
            "expected docs/MINIMUM.md to equal the generator's rendering of the same page "
            "metadata; run python3 scripts/generate_sim_route.py",
        )

    def test_the_minimum_is_a_real_subset_of_the_core_route(self):
        facts = gen.minimum_facts()
        core_modules = set(gen.CORE_MODULES)
        minimum_modules = {row["id"] for row in facts["modules"]}
        self.assertEqual(
            sorted(minimum_modules - core_modules), [],
            "expected no minimum practice module outside the Core route; every one must be a "
            "page the full route also requires, or the stopping point is a second course",
        )
        core_lessons = {
            row["id"] for step in gen.route_model.facts()["steps"] for row in step["lessons"]
        }
        minimum_lessons = {row["id"] for row in facts["lessons"] + facts["arm_lessons"]}
        self.assertEqual(
            sorted(minimum_lessons - core_lessons), [],
            "expected no minimum lesson outside the Core route; the stopping point cannot require "
            "a page the full route does not, or the two routes disagree",
        )
        self.assertEqual(
            facts["high"] < gen.route_facts()["high"], True,
            "expected the minimum finish's high end to be below the full route's; otherwise it is "
            "not an honest stopping point, just the same course with a new name",
        )

    def test_the_minimum_total_is_the_sum_of_its_rows(self):
        facts = gen.minimum_facts()
        low = sum(row["low"] or 0.0 for row in facts["lessons"] + facts["arm_lessons"])
        high = sum(row["high"] or 0.0 for row in facts["lessons"] + facts["arm_lessons"])
        low += sum(row["low"] or 0.0 for row in facts["modules"])
        high += sum(row["high"] or 0.0 for row in facts["modules"])
        with open(MINIMUM, encoding="utf-8") as handle:
            doc = handle.read()
        self.assertIn(
            f"| **{gen.fmt(round(low, 2), round(high, 2))}** |", doc,
            f"expected the minimum total row to sum to {low:.2f}-{high:.2f} focused hours from "
            f"its own rows; a total that is typed rather than summed drifts on the next page edit",
        )

    def test_the_readme_links_the_minimum_finish(self):
        self.assertIn(
            "docs/MINIMUM.md", self.readme,
            "expected README.md to link the exact minimum page list; a finish line without a "
            "page list is a slogan, not a route",
        )

    def test_the_hours_basis_sentence_is_generated_from_the_metadata(self):
        facts = gen.route_facts()
        expected = gen.hours_basis(facts)
        self.assertIn(
            f"<!-- sim-route:hours-basis -->{expected}<!-- /sim-route -->", self.readme,
            "expected README.md's planning clause to be the generated one; a hand-written 'the "
            "high end is the slow-learner figure' is false while any required page states a "
            "single estimate, which is the majority of them",
        )
        self.assertIn(
            f"**Estimate coverage:** {expected[0].upper() + expected[1:]}.", self.doc,
            "expected docs/SIM_ROUTE.md to state the same coverage the README does, generated "
            "from the page metadata rather than typed",
        )

    def test_the_coverage_counts_are_the_pages_own(self):
        facts = gen.route_facts()
        pages = slow = 0
        for _label, pattern, stop_before in gen.CORE_TRACKS:
            for row in gen.track_rows(pattern, stop_before):
                pages += 1
                slow += 1 if row["low"] is not None and row["high"] > row["low"] else 0
        arm = {row["id"] for row in gen.module_rows() if row["id"] in set(gen.ARM_MODULES)}
        for row in gen.module_rows():
            if row["id"] in arm:
                pages += 1
                slow += 1 if row["low"] is not None and row["high"] > row["low"] else 0
        self.assertEqual(
            (facts["pages"], facts["slow_pages"]), (pages, slow),
            f"expected route_facts to count the same {pages} arm pages and {slow} with a "
            f"slow-learner range as a walk of CORE_TRACKS plus ARM_MODULES does; otherwise the "
            f"coverage sentence describes a route the page does not list",
        )

    def test_every_optional_module_is_real_and_justified(self):
        """An optional module has to exist, stay outside every route, and come with a reason long
        enough to be one — otherwise the exception is just a gap."""
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
                f"`{ident}`", self.depth,
                f"expected {ident} to be rendered in {DEPTH}; an exception the page never "
                f"mentions is invisible to the learner it was written for",
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

    def test_the_depth_line_stays_in_the_depth_pass(self):
        """The three Tier 3 depth modules are the depth line; the capstone stays on the arm route."""
        for ident in (
            "05-control.T3.05a",
            "05-control.T3.05b",
            "05-control.T3.05c",
        ):
            self.assertIn(
                ident, gen.DEPTH_MODULES,
                f"expected {ident}, one of the three Tier 3 depth modules, to stay in the "
                f"depth pass; moving it to Extensions leaves the depth line with the covariance "
                f"half and no filter to use it in",
            )
        self.assertIn(
            "08-capstones.T3.07a", gen.ARM_MODULES,
            "expected the capstone to stay on the arm route; it is the arm's last page, not "
            "depth practice",
        )

    def test_track_p_follows_the_lesson_numbers_not_the_filenames(self):
        """Plain filename order lists P.10 before P.2; the route has to follow the lesson numbers."""
        ids = [row["id"] for row in gen.track_rows("track-p/*.md", None)]
        self.assertEqual(
            ids, sorted(ids, key=gen.lesson_order),
            f"expected Track P rows in lesson-number order, got {ids}",
        )
        self.assertLess(
            self.doc.index("`P.2`"), self.doc.index("`P.10`"),
            "expected P.2 before P.10 in docs/SIM_ROUTE.md; string order puts P.10 first",
        )

    def test_each_track_p_lesson_comes_before_the_one_it_hands_to(self):
        """A page's generated next-step link names the lesson that depends on it, so the route must
        list the dependent after it. Filename order breaks this at P.9 -> P.10."""
        order = {row["id"]: i for i, row in enumerate(gen.track_rows("track-p/*.md", None))}
        checked = 0
        for path in sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md"))):
            source = gen.frontmatter(path).get("lesson_id", "")
            with open(path, encoding="utf-8") as handle:
                match = re.search(
                    r"<!-- next-step:start -->.*?Lesson (P\.\w+):", handle.read(), re.DOTALL
                )
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

    def test_track_p_ids_are_the_documented_set(self):
        """Track P has no P.13: the numbering skips it on purpose, and the route must show exactly the
        documented set. Renumbering P.14 would orphan learners' saved progress, which is keyed by id."""
        ids = [row["id"] for row in gen.track_rows("track-p/*.md", None)]
        expected = [f"P.{n}" for n in range(1, 13)] + ["P.14", "P.M"]
        self.assertEqual(
            sorted(ids, key=gen.lesson_order), expected,
            f"expected Track P to be P.1-P.12, P.14 and the P.M milestone, got {ids}; a new or "
            f"missing id changes saved progress and the lint/test sets that name these ids",
        )
        for ident in expected:
            self.assertIn(
                f"`{ident}`", self.doc,
                f"expected {ident} in the route page; a required milestone missing from the route "
                f"is a lesson a learner is never asked to finish",
            )

    def test_the_count_labels_match_the_generated_route(self):
        """The bridge counts quoted in the QUALITY_SPEC and the lab BOM must be the counts the route
        computes from the pages, split the same way (Core vs Extensions, and by tier)."""
        bridge = [row for row in gen.module_rows() if row["tier"] in ("1", "2", "3")]
        core = [row for row in bridge if row["id"] in gen.CORE_MODULES]
        ext = [row for row in bridge if row["id"] not in gen.CORE_MODULES]
        tiers = {t: sum(1 for row in bridge if row["tier"] == t) for t in ("1", "2", "3")}
        total = len(bridge)
        with open(os.path.join(ROOT, "docs", "QUALITY_SPEC.md"), encoding="utf-8") as handle:
            spec = handle.read()
        applies = re.search(
            r"Applies to the \*\*(\d+) bridge modules\*\*.*?\((\d+) Tier 1, (\d+) Tier 2, (\d+) Tier 3\)"
            r".*?the \*\*(\d+) Core\*\*.*?\*\*(\d+) Extensions\*\*",
            spec, re.DOTALL,
        )
        self.assertIsNotNone(
            applies,
            "expected docs/QUALITY_SPEC.md to state the bridge total, the tier split and the "
            "Core/Extensions split in its 'Applies to' line; check the wording was not reformatted",
        )
        got = tuple(int(x) for x in applies.groups())
        want = (total, tiers["1"], tiers["2"], tiers["3"], len(core), len(ext))
        self.assertEqual(
            got, want,
            f"expected docs/QUALITY_SPEC.md to state (total, T1, T2, T3, Core, Extensions) = "
            f"{want} from the pages, got {got} - a bridge count that is typed rather than computed "
            f"drifts when a module moves between Core and Extensions",
        )
        graded = re.findall(r"all (\d+) bridge modules \(Core and Extensions\)", spec)
        self.assertEqual(
            [int(x) for x in graded], [total],
            f"expected QUALITY_SPEC to say 'all {total} bridge modules (Core and Extensions)' "
            f"exactly once, found {graded}",
        )
        with open(os.path.join(ROOT, "resources", "lab-workbench-bom.md"), encoding="utf-8") as handle:
            bom = handle.read()
        bom_counts = [int(x) for x in re.findall(r"all (\d+) Bridge Modules", bom)]
        self.assertEqual(
            bom_counts, [total],
            f"expected resources/lab-workbench-bom.md to say 'all {total} Bridge Modules' exactly "
            f"once, found {bom_counts} - the BOM promises a $0 path to every bridge module",
        )

    def test_the_08_1_lesson_count_matches_the_validator(self):
        """The 08.1 capstone tells a learner how many beginner lessons they have completed. The validator
        counts those lessons from the track folders, so the capstone's figure must equal that count, or
        the finish line it names is not the course's own."""
        capstone_path = os.path.join(
            ROOT, "08-capstone-projects", "08.1-tier1-2dof-compliant-arm-capstone.md"
        )
        with open(capstone_path, encoding="utf-8") as handle:
            quoted = re.findall(r"Completing all (\d+) beginner lessons", handle.read())
        self.assertEqual(
            len(quoted), 1,
            f"expected 08.1 to quote the beginner lesson count exactly once, found {quoted}; check "
            f"the 'Completing all N beginner lessons' recap line was not reworded",
        )
        run = subprocess.run(
            [sys.executable, os.path.join("scripts", "validate_modules.py")],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(
            run.returncode, 0,
            f"expected scripts/validate_modules.py to pass so its lesson count can be read, got exit "
            f"{run.returncode}: {run.stdout.strip()} {run.stderr.strip()}",
        )
        counted = re.search(r"(\d+) beginner lessons;", run.stdout)
        self.assertIsNotNone(
            counted,
            f"expected validate_modules.py to print 'N beginner lessons;', got: {run.stdout.strip()!r}",
        )
        self.assertEqual(
            quoted[0], counted.group(1),
            f"expected 08.1 to say {counted.group(1)} beginner lessons, the validator's count; it says "
            f"{quoted[0]} - the capstone's finish line has drifted from the course",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
