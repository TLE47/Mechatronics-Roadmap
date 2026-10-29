#!/usr/bin/env python3
"""The surface snapshot measures the page, never GitHub's queue.

`tab-links` renders one link per open `link-rise` issue, read live from the GitHub API at mount
(`app/src/components/RiseIssuesPanel.tsx`). The baseline recorded 6 links with one issue open; a
dispatched sweep filed #69, the queue grew to two, and `check:snapshot` failed on `main` with every
box exactly where the baseline put it (run 40820681859, reproduced by its rerun). Nothing in the app
had moved: the count was measuring the queue, not the surface.

The sweep answers that one request with a fixed issue now. These tests keep the answer in place and
honest: the route must exist before the first navigation, the fixture must be a single issue shaped
the way the panel reads one, and the panel must still be the thing that asks GitHub - if its URL
moves to another origin, the route silently stops matching and the drift comes back.

These read the files as text on purpose, the same way `tests/test_workflows.py` does: the property
is "this request is answered", which needs no JavaScript runtime to check.

Run: `python3 tests/test_snapshot_stub.py` (also discovered by `python3 -m unittest discover`).
"""

import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SWEEP = os.path.join(ROOT, "scripts", "snapshot_surfaces.mjs")
PANEL = os.path.join(ROOT, "app", "src", "components", "RiseIssuesPanel.tsx")
BASELINE = os.path.join(ROOT, "docs", "surface-snapshot.json")
ROUTE = "page.route('https://api.github.com/**'"


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


class SnapshotStubTests(unittest.TestCase):
    def test_the_sweep_answers_the_issues_api_before_the_first_navigation(self):
        text = read(SWEEP)
        self.assertIn(
            ROUTE,
            text,
            msg="expected the sweep to answer the GitHub issues request: `tab-links` renders one "
            "link per open `link-rise` issue, so without this the recorded count tracks the queue "
            "and a sweep that files an issue turns `check:snapshot` red on `main`",
        )
        self.assertIn(
            "RISE_ISSUE_FIXTURE",
            text,
            msg="expected the answer to be the named fixture the tests below read",
        )
        self.assertLess(
            text.index(ROUTE),
            text.index("await page.goto(baseUrl"),
            msg="expected the route before the first navigation: installed after it, the panel's "
            "mount has already asked GitHub and the fixture never answers",
        )

    def test_the_fixture_is_one_issue_the_panel_can_render(self):
        text = read(SWEEP)
        start = text.index("const RISE_ISSUE_FIXTURE = [")
        block = text[start : text.index("];", start)]
        for field in ("number:", "title:", "html_url:", "created_at:"):
            with self.subTest(field=field):
                self.assertIn(
                    field,
                    block,
                    msg=f"expected the fixture to carry `{field}`: the panel reads that field, and a "
                    "fixture missing it renders a row with a blank link or no age",
                )
        self.assertEqual(
            block.count("number:"),
            1,
            msg="expected exactly one fixture issue: the recorded `tab-links` link count is the "
            "surface's own links plus this row, and a second row moves the baseline",
        )
        self.assertNotIn(
            "pull_request",
            block,
            msg="expected no `pull_request` in the fixture: the panel filters PRs out of the issues "
            "endpoint, so one here would be rendered as a rise issue or silently disappear, and "
            "neither is what the baseline records",
        )

    def test_the_panel_still_asks_the_origin_the_fixture_answers(self):
        text = read(PANEL)
        match = re.search(r"ISSUES_API\s*=\s*`([^`]+)`", text)
        self.assertIsNotNone(
            match,
            msg="expected `RiseIssuesPanel` to keep a single `ISSUES_API` constant for the tests to "
            "read; the sweep's route must match whatever URL it asks",
        )
        self.assertTrue(
            match.group(1).startswith("https://api.github.com/"),
            msg="expected the panel's request to stay on https://api.github.com/, the origin the "
            f"sweep answers; it now asks {match.group(1)!r}, which the route does not match",
        )

    def test_the_baseline_records_the_tab_links_surface(self):
        surfaces = json.loads(read(BASELINE))["surfaces"]
        entries = {name: entry for name, entry in surfaces.items() if name.endswith("/tab-links")}
        self.assertEqual(
            len(entries),
            4,
            msg="expected the baseline to record `tab-links` in all four palettes: it is the "
            "surface this stub exists for, and dropping one would hide the drift instead of fixing it",
        )
        for name, entry in entries.items():
            with self.subTest(surface=name):
                self.assertIsInstance(
                    entry.get("counts", {}).get("links"),
                    int,
                    msg=f"expected {name} to record a link count, the field the live queue moved",
                )


if __name__ == "__main__":
    unittest.main()
