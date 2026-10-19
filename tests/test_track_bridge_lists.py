#!/usr/bin/env python3
"""Every ladder page must stay linked from its own track index page.

A track README is the only index a learner follows into the ladder, and it names each module twice:
once in the `📚 Required Foundations & Bridge Modules` block and once in the exercise it unlocks. A
renumbering, a split, or a new bridge page that skips the README leaves a page a learner can only
reach by guessing its filename - the same failure the `T2.00f` split produced in the other eight
tracks, where `T2.00i` and `T2.00j` existed but no track index pointed at them.

The mapping is derived, not listed: a module id's leading two digits name its track directory
(`04-embedded.T3.04a` -> `04-embedded-and-realtime/README.md`), and the test fails when a module has
no track, when a track has no modules, and when a page is missing from its track's links.

Run: `python3 tests/test_track_bridge_lists.py` (also picked up by `python3 -m unittest discover -s tests`
in CI).
"""

# `str | None` below is annotation-only; the system 3.9 interpreter has no PEP 604 support otherwise.
from __future__ import annotations

import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES = os.path.join(ROOT, "modules")

TRACK_DIR_RE = re.compile(r"^(\d{2})-")
MODULE_LINK_RE = re.compile(r"\.\./modules/([\w.\-]+)\.md")


def track_readmes() -> dict[str, str]:
    """`{"04": "04-embedded-and-realtime/README.md"}` for every numbered track with a README."""
    tracks = {}
    for entry in sorted(os.listdir(ROOT)):
        match = TRACK_DIR_RE.match(entry)
        if not match:
            continue
        readme = os.path.join(entry, "README.md")
        if os.path.isfile(os.path.join(ROOT, readme)):
            tracks[match.group(1)] = readme
    return tracks


def module_ids() -> list[str]:
    return sorted(
        name[:-3] for name in os.listdir(MODULES) if name.endswith(".md")
    )


def modules_by_track() -> dict[str, list[str]]:
    """Module ids grouped by the two-digit track prefix their filename carries."""
    grouped: dict[str, list[str]] = {}
    for module in module_ids():
        match = TRACK_DIR_RE.match(module)
        if match:
            grouped.setdefault(match.group(1), []).append(module)
    return grouped


def linked_modules(readme_text: str) -> set[str]:
    return set(MODULE_LINK_RE.findall(readme_text))


def missing_ladder_pages(prefix: str, readme_text: str) -> list[str]:
    """The track's module pages the README never links. Empty is the healthy answer."""
    linked = linked_modules(readme_text)
    return [module for module in modules_by_track().get(prefix, []) if module not in linked]


def bridge_section(readme_text: str) -> str:
    """The bridge-module section a track README ends with, or the whole page when it has no heading."""
    marker = re.search(r"^##+ .*Bridge Modules.*$", readme_text, flags=re.MULTILINE)
    return readme_text[marker.end():] if marker else readme_text


def next_track_first_bridge(prefix: str) -> str | None:
    """The first Tier 2/3 bridge page of the next numbered track, or None for the last track."""
    later = [key for key in sorted(track_readmes()) if key > prefix]
    if not later:
        return None
    for module in modules_by_track().get(later[0], []):
        if ".T2." in module or ".T3." in module:
            return module
    return None


def missing_handoff(prefix: str, readme_text: str) -> str | None:
    """The next track's first bridge page, when this README's bridge section never names it."""
    target = next_track_first_bridge(prefix)
    if target is None:
        return None
    return None if f"../modules/{target}.md" in bridge_section(readme_text) else target


class TrackBridgeListTests(unittest.TestCase):
    def test_every_ladder_page_is_linked_from_its_track_readme(self):
        missing = {}
        for prefix, readme in track_readmes().items():
            with open(os.path.join(ROOT, readme), encoding="utf-8") as handle:
                absent = missing_ladder_pages(prefix, handle.read())
            if absent:
                missing[readme] = absent
        self.assertEqual(
            missing,
            {},
            "check that each track README links every module whose id starts with its two digits; "
            "expected one `../modules/<id>.md` link per page, and a new or renamed page needs one "
            "added to the `Required Foundations & Bridge Modules` block and its exercise",
        )

    def test_no_module_page_is_orphaned(self):
        tracks = track_readmes()
        orphans = [module for module in module_ids() if module[:2] not in tracks]
        self.assertEqual(
            orphans,
            [],
            "check that every module's two-digit prefix matches a `NN-*/README.md`; expected no "
            "orphans, so a renamed track directory or a stray id in modules/ would otherwise drop "
            "silently out of this test's scope",
        )

    def test_every_track_has_ladder_pages(self):
        empty = [prefix for prefix in track_readmes() if not modules_by_track().get(prefix)]
        self.assertEqual(
            empty,
            [],
            "check that every numbered track owns at least one module page; expected a non-empty "
            "ladder per track, and an empty group means its bridge pages were renamed or moved",
        )

    def test_each_readme_hands_off_to_the_next_tracks_bridge_page(self):
        missing = {}
        for prefix, readme in track_readmes().items():
            with open(os.path.join(ROOT, readme), encoding="utf-8") as handle:
                target = missing_handoff(prefix, handle.read())
            if target:
                missing[readme] = target
        self.assertEqual(
            missing,
            {},
            "check the handoff line in each bridge section; expected every README before Track 08 to "
            "link the next track's first Tier 2/3 bridge page, so a learner finishing a track has the "
            "next step in the page they are already reading",
        )

    def test_the_handoff_detector_notices_a_dropped_line(self):
        """A detector that only reads what the page already says would pass on any content."""
        prefix = next(key for key in sorted(track_readmes()) if next_track_first_bridge(key))
        with open(os.path.join(ROOT, track_readmes()[prefix]), encoding="utf-8") as handle:
            text = handle.read()
        target = next_track_first_bridge(prefix)
        stripped = text.replace(f"../modules/{target}.md", f"../modules/{target}-missing.md")
        self.assertEqual(
            missing_handoff(prefix, stripped),
            target,
            f"check the handoff detector: expected {target} reported once its link is gone, otherwise "
            f"a README could drop the handoff without failing anything",
        )

    def test_the_last_track_has_no_handoff(self):
        last = sorted(track_readmes())[-1]
        self.assertIsNone(
            next_track_first_bridge(last),
            "check the discovery: expected the last numbered track to have no successor, otherwise the "
            "test would require a handoff to a track that does not exist",
        )

    def test_the_detector_notices_a_dropped_link(self):
        """The check above must fail on a removal, not pass because it read the same list twice."""
        prefix, readme = next(iter(track_readmes().items()))
        with open(os.path.join(ROOT, readme), encoding="utf-8") as handle:
            text = handle.read()
        dropped = modules_by_track()[prefix][0]
        stripped = text.replace(f"../modules/{dropped}.md", f"../modules/{dropped}-missing.md")
        self.assertEqual(
            missing_ladder_pages(prefix, stripped),
            [dropped],
            f"check the detector itself: expected {dropped} reported once its link is gone, so a "
            f"silent pass here would mean the test cannot catch the regression it exists for",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
