#!/usr/bin/env python3
"""Re-record the one surface the sweep's own data moves
(`scripts/record_links_surface.py`, run by `.github/workflows/link-check.yml`)

The weekly sweep appends a row to `docs/link-check-history.jsonl` and regenerates
`app/src/data/linkHistoryData.ts`. The Links tab draws its host and run tables from that module, so the
tab gets taller with no code change — and `docs/surface-snapshot.json` records those heights. The data
commit therefore used to land without the snapshot and turn `main` red: `a79e857` moved `tab-links` by
87 px in all four palettes, with every count and resolved style unchanged, and nobody had re-recorded.

This is the small program that closes the loop. It measures the one surface and then:

* **nothing moved** — says so and exits 0, so the caller commits the data on its own;
* **only `tab-links` boxes moved** — re-records that surface in all four palettes
  (`node scripts/snapshot_surfaces.mjs --record --tab tab-links`), proves the file now checks clean,
  and exits 0;
* **anything else moved** — another surface, or a count, or a resolved style on this one — exits 1 with
  the rows. A code change must not be papered over by the weekly commit, and a count moving means the
  data changed the surface's *shape*, not just its height.

The measurement happens **in the job that defines the file**, `ci.yml`'s audits job: that is where every
number in `docs/surface-snapshot.json` comes from, so a data push has to be followed by the same ruler in
the same run. The first version recorded from the sweep's own job, wrote 199 where the gate then read
152, and blamed the job. The job was not the difference: `getBoundingClientRect` is viewport-relative,
and a window scrolled 47 px down records every box 47 px higher — which the sweep now rules out by
starting each read from the top of the page (`scripts/snapshot_surfaces.mjs`).

Usage
    python3 scripts/record_links_surface.py              # measure; record if only the data moved the tab
    python3 scripts/record_links_surface.py --dry-run    # say what it would record, write nothing
    python3 scripts/record_links_surface.py --json       # machine-readable, stdout only
    python3 scripts/record_links_surface.py --check      # a gate: fail if a re-record is needed

The record itself is refused outside CI (`--allow-local` overrides): the numbers belong to the job that
checks them, and a run elsewhere writes its own chrome into the file.

Exit-code family: typed
    0  nothing moved, or the surface was re-recorded and now checks clean
    1  movement this program must not record, or the re-record did not take
    2  the sweep could not run (no Node, no build, no Chromium, unreadable output)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAPSHOT = os.path.join("docs", "surface-snapshot.json")
SWEEP = os.path.join("scripts", "snapshot_surfaces.mjs")

#: The surface whose height follows the sweep's data. Every other surface is code.
SURFACE = "tab-links"

#: The only part of a surface a data refresh may move: geometry. Not counts, not resolved styles.
RECORDABLE_PART = "boxes"


def offenders(drift: list[dict], stale: list[str]) -> list[dict]:
    """Every difference this program refuses to record, as one row each.

    A row is allowed only when it belongs to the Links tab and to the `boxes` part. A stale surface (one
    in the file the sweep did not produce) is never data: a tab was removed or renamed.
    """
    bad = [
        row
        for row in drift
        if not (
            str(row.get("surface", "")).endswith(f"/{SURFACE}")
            and row.get("part") == RECORDABLE_PART
        )
    ]
    bad.extend({"surface": name, "part": "surface", "field": "stale", "expected": None, "actual": "missing"} for name in stale)
    return bad


def parse_body(text: str) -> dict | None:
    """The sweep's `--json` body, also when a build's own output shares stdout with it.

    `ensureBuilt` runs `npm run build` in the sweep's process, and Vite writes to stdout: on a run that
    rebuilds, the JSON is the tail rather than the whole stream. Take the last object that parses.
    """
    text = text.strip()
    if not text:
        return None
    # `start` is the position of a `{` that begins a line (or 0), so the candidate is the rest of the
    # stream from that brace: the sweep prints its JSON last, after whatever a rebuild wrote.
    starts = [0, *(index for index, char in enumerate(text) if char == "{" and index and text[index - 1] == "\n")]
    for start in starts:
        try:
            body = json.loads(text[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(body, dict) and "drift" in body:
            return body
    return None


def sweep(*args: str) -> tuple[int, dict | None, str]:
    """Run the snapshot sweep and return (exit status, parsed `--json` body, stderr)."""
    completed = subprocess.run(
        ["node", SWEEP, "--json", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env={**os.environ, "CI": "true"},
    )
    return completed.returncode, parse_body(completed.stdout), completed.stderr


def entry(options: argparse.Namespace) -> int:
    status, body, stderr = sweep("--tab", SURFACE)
    if body is None:
        print(f"[FAIL] the sweep produced no readable JSON (exit {status})", file=sys.stderr)
        if stderr:
            print(stderr.strip()[-2000:], file=sys.stderr)
        return 2

    drift = body.get("drift", [])
    stale = body.get("stale", [])
    refused = offenders(drift, stale)

    if not drift and not stale:
        if options.json:
            print(json.dumps({"surface": SURFACE, "moved": False, "recorded": []}, indent=2))
        else:
            print(f"no movement on {SURFACE}: nothing to record")
        return 0

    if refused:
        if options.json:
            print(json.dumps({"surface": SURFACE, "moved": True, "recorded": [], "refused": refused}, indent=2))
        else:
            print(f"[FAIL] {len(refused)} difference(s) this step must not record:", file=sys.stderr)
            for row in refused:
                print(
                    f"  {row['surface']} · {row['part']}.{row['field']} — "
                    f"expected {json.dumps(row.get('expected'))}, got {json.dumps(row.get('actual'))}",
                    file=sys.stderr,
                )
            print(
                "\nA count or style moving, or another surface moving, is a code change: fix it, or "
                "re-record it in a pull request and read the diff.",
                file=sys.stderr,
            )
        return 1

    if options.check:
        if options.json:
            print(json.dumps({"surface": SURFACE, "moved": True, "recorded": [], "drift": drift}, indent=2))
        else:
            print(f"[FAIL] {SURFACE} needs a re-record — run python3 {os.path.relpath(__file__, ROOT)}")
        return 1

    if options.dry_run:
        if options.json:
            print(json.dumps({"surface": SURFACE, "moved": True, "would_record": drift}, indent=2))
        else:
            print(f"would re-record {len(drift)} field(s) on {SURFACE}:")
            for row in drift:
                print(f"  {row['surface']} · {row['field']} → {json.dumps(row.get('actual'))}")
        return 0

    # Recording is a decision the gate then has to live with, so it is made where the gate reads the
    # file and nowhere a passing suite makes it feel incidental. The workflow sets `CI`; this is the
    # one place that can check it.
    if not options.allow_local and os.environ.get("CI", "").lower() not in {"true", "1"}:
        print(
            "[FAIL] refusing to record off CI: docs/surface-snapshot.json is the audits job's own "
            "measurement, and a run anywhere else writes a different chrome into it. Re-record from that "
            "job, or pass --allow-local if that is genuinely what you want.",
            file=sys.stderr,
        )
        return 2

    # `--tab` without `--palette` records this surface in every palette and merges it into the file,
    # leaving the other 48 surfaces exactly as committed.
    record = subprocess.run(
        ["node", SWEEP, "--record", "--tab", SURFACE],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env={**os.environ, "CI": "true"},
    )
    if record.returncode != 0:
        print(f"[FAIL] the re-record exited {record.returncode}", file=sys.stderr)
        if record.stderr:
            print(record.stderr.strip()[-2000:], file=sys.stderr)
        return 1

    # And prove it took, rather than believing the exit code: the file must now check clean.
    confirm_status, confirm, confirm_stderr = sweep("--tab", SURFACE)
    if confirm is None or confirm.get("drift") or confirm.get("stale"):
        print("[FAIL] the re-record did not settle the surface", file=sys.stderr)
        if confirm is None and confirm_stderr:
            print(confirm_stderr.strip()[-2000:], file=sys.stderr)
        elif confirm is not None:
            for row in confirm.get("drift", []):
                print(f"  {row['surface']} · {row['part']}.{row['field']}: {row.get('actual')}", file=sys.stderr)
        return 1

    if options.json:
        print(json.dumps({"surface": SURFACE, "moved": True, "recorded": drift, "file": SNAPSHOT}, indent=2))
    else:
        print(f"re-recorded {len(drift)} field(s) on {SURFACE} into {SNAPSHOT}:")
        for row in drift:
            print(
                f"  {row['surface']} · {row['field']}: {json.dumps(row.get('expected'))} → "
                f"{json.dumps(row.get('actual'))}"
            )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Re-record the Links tab when the weekly sweep's own data moved it.",
        epilog="Exit-code family: typed (0 fine, 1 movement not to be recorded, 2 the sweep could not run).",
    )
    parser.add_argument("--dry-run", action="store_true", help="say what would be recorded, write nothing")
    parser.add_argument(
        "--allow-local",
        action="store_true",
        help="allow a record outside CI, where nothing has checked the numbers before they are written",
    )
    parser.add_argument("--check", action="store_true", help="exit 1 when a re-record is needed")
    parser.add_argument("--json", action="store_true", help="machine-readable summary on stdout")
    parser.add_argument("--no-input", action="store_true", help="never prompt (this program never does)")
    options = parser.parse_args(argv)
    return entry(options)


if __name__ == "__main__":
    sys.exit(main())
