#!/usr/bin/env python3
"""The nine track index pages must stay inside `check_links.py`'s scan set.

The checker named three of these pages in its external-scope logic from `416f2d9` on, but never put
any of them in the file list, so for years the pages a learner opens first were the only ones whose
links nothing fetched. Adding them once is not the fix; keeping them there is. This test discovers
the track directories on disk (`NN-*/README.md`) instead of repeating a literal list, so it fails both
ways the regression returns:

* a page dropped from `TRACK_READMES` (or from the list built from it), and
* a new numbered track whose index page nobody added to the checker.

Run: `python3 tests/test_link_scan_set.py` (also picked up by `python3 -m unittest discover -s tests`
in CI).
"""

import glob
import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_links  # noqa: E402

# `00-foundations`, `01-electronics-and-power`, ... `08-capstone-projects`. `track-p` and `stage-0`
# are ramp directories with their own READMEs, already in the list by name and not numbered tracks.
TRACK_DIR_RE = re.compile(r"^\d{2}-")


def track_readmes_on_disk() -> list[str]:
    """Every `NN-*/README.md` under the repo root, normalized, in directory order."""
    readmes = []
    for entry in sorted(os.listdir(ROOT)):
        if not TRACK_DIR_RE.match(entry):
            continue
        path = os.path.normpath(os.path.join(ROOT, entry, "README.md"))
        if os.path.isfile(path):
            readmes.append(path)
    return readmes


def scan_set() -> list[str]:
    """The markdown files the checker actually opens, normalized."""
    return [os.path.normpath(path) for path in check_links.get_target_markdown_files()]


def missing_track_readmes(scanned) -> list[str]:
    """The track index pages on disk that `scanned` does not open. Empty is the healthy answer."""
    opened = {os.path.normpath(path) for path in scanned}
    return [path for path in track_readmes_on_disk() if path not in opened]


class LinkScanSetTests(unittest.TestCase):
    def test_every_track_index_page_is_scanned(self):
        self.assertEqual(
            missing_track_readmes(scan_set()),
            [],
            "a track index page is missing from check_links.py's scan set; every `NN-*/README.md` "
            "must be in `TRACK_READMES`, which `get_target_markdown_files()` reads",
        )

    def test_the_declared_pages_are_the_pages_on_disk(self):
        declared = {os.path.normpath(path) for path in check_links.TRACK_READMES}
        self.assertEqual(
            declared,
            set(track_readmes_on_disk()),
            "check that `TRACK_READMES` and the numbered track directories agree; expected one "
            "entry per track, so a new track needs its README in the tuple and a removed track "
            "must not leave a stale entry behind",
        )

    def test_every_declared_page_reaches_the_file_list(self):
        opened = set(scan_set())
        declared = {os.path.normpath(path) for path in check_links.TRACK_READMES}
        self.assertEqual(
            sorted(declared - opened),
            [],
            "`TRACK_READMES` names a page that `get_target_markdown_files()` never returns; check "
            "that the tuple is still unpacked into the file list",
        )

    def test_the_detector_notices_a_dropped_page(self):
        """The stage above must fail on a drop, not pass because both sides read the same list."""
        dropped = track_readmes_on_disk()[0]
        self.assertEqual(
            missing_track_readmes([path for path in scan_set() if os.path.normpath(path) != dropped]),
            [dropped],
            f"dropping {dropped} from the scanned files must be reported; a detector that stays "
            f"silent here would let the page fall out of the checker without a failing test",
        )

    def test_every_resources_page_is_scanned(self):
        """The reference pages carried two dead citations while three of seven were scanned."""
        opened = {os.path.normpath(path) for path in scan_set()}
        resources = sorted(glob.glob(os.path.join(ROOT, "resources", "*.md"))) + sorted(
            glob.glob(os.path.join(ROOT, "resources", "*", "README.md"))
        )
        missing = [os.path.normpath(path) for path in resources if os.path.normpath(path) not in opened]
        self.assertEqual(
            missing,
            [],
            "check that `get_target_markdown_files()` globs every markdown page under resources/; "
            "expected all of them scanned, since naming three of the seven is how two dead citations "
            "stayed invisible",
        )

    def test_the_scan_set_skips_no_readme_that_exists(self):
        """A declared-but-absent page is filtered out silently; flag one instead of shrinking quietly."""
        declared = [os.path.normpath(path) for path in check_links.TRACK_READMES]
        absent = [path for path in declared if not os.path.isfile(path)]
        self.assertEqual(
            absent,
            [],
            "check that every path in `TRACK_READMES` exists; `get_target_markdown_files()` drops "
            "missing paths, so the expected failure is a silently shrunken scan set",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
