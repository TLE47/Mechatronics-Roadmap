#!/usr/bin/env python3
"""Generate app/src/data/linkHistoryData.ts from docs/link-check-history.jsonl.

`scripts/check_links.py --history docs/link-check-history.jsonl` appends exactly one JSON line per
run (the nightly workflow does this), so the file is the append-only record of how many citations
could actually be verified. The workbench's Link Health dashboard reads the same numbers, which
means the page cannot drift from the checker: this script is the only writer of the TS module, and
CI runs it with `--check` like the other generated artefacts.

Fields are normalized to camelCase and every row keeps its full `verdicts` breakdown. A line that
is not valid JSON, or a row without a parseable `date`, is *skipped and reported* rather than
silently plotted as zero: a corrupt history file must be visible, not averaged away.

Usage:
  python3 scripts/generate_link_history_data.py            # write the TS module
  python3 scripts/generate_link_history_data.py --check    # exit 1 if it is out of sync
  python3 scripts/generate_link_history_data.py --json     # machine-readable summary on stdout
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_HISTORY = os.path.join(ROOT, "docs", "link-check-history.jsonl")
DEFAULT_OUT = os.path.join(ROOT, "app", "src", "data", "linkHistoryData.ts")

# Counts the dashboard plots or sums. Missing keys default to 0 so an older record still renders.
COUNTS = ("urls", "served", "not_checked", "failed")


class HistoryError(Exception):
    """The history file cannot be turned into a faithful chart."""


def parse_timestamp(value: object, where: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise HistoryError(f"{where}: missing `date`; every run record needs an ISO-8601 timestamp")
    text = value.strip()
    try:
        stamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HistoryError(f"{where}: `date` {text!r} is not ISO-8601 ({exc})") from exc
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)


def count(record: dict, key: str, where: str) -> int:
    value = record.get(key, 0)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise HistoryError(f"{where}: `{key}` must be a non-negative number, got {value!r}")
    return int(round(value))


def parse_unverified(record: dict, where: str) -> list[str] | None:
    """The row's unverified URL list, or None for a row recorded before the field existed.

    None is not an empty list: an old row says nothing about which hosts were walled, so it must
    not contribute a zero to a recurrence count that claims to span every run.
    """
    raw = record.get("unverified")
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise HistoryError(f"{where}: `unverified` must be a list, got {type(raw).__name__}")
    return [str(url).strip() for url in raw if str(url).strip()]


def host_of(url: str) -> str:
    """The host a citation belongs to, with a leading `www.` removed so the two spellings agree."""
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def host_recurrence(rows: list[dict]) -> tuple[list[dict], int]:
    """How often each host appears in the unverified pile, and in how many runs it could appear.

    A host that walls one citation every week is a different problem from a page that broke once:
    the first is the publisher's stance toward scripts, the second is a citation to fix. Counting
    distinct runs, rather than URLs, keeps a host with ten blocked PDFs from looking ten times
    flakier than one with a single blocked page.
    """
    hosts: dict[str, dict] = {}
    runs_with_urls = 0
    for row in rows:
        urls = row.get("unverified")
        if urls is None:
            continue
        runs_with_urls += 1
        per_host: dict[str, set[str]] = {}
        for url in urls:
            host = host_of(url)
            if host:
                per_host.setdefault(host, set()).add(url)
        for host in per_host:
            entry = hosts.setdefault(host, {"host": host, "runs": 0, "urls": 0, "lastSeen": ""})
            entry["runs"] += 1
            entry["lastSeen"] = row["date"]

    latest = next((row["unverified"] for row in reversed(rows) if row.get("unverified") is not None), [])
    now: dict[str, int] = {}
    for url in latest:
        host = host_of(url)
        if host:
            now[host] = now.get(host, 0) + 1
    for host, entry in hosts.items():
        entry["urls"] = now.get(host, 0)

    ordered = sorted(hosts.values(), key=lambda entry: (-entry["runs"], -entry["urls"], entry["host"]))
    return ordered, runs_with_urls


def verdicts_of(record: dict, where: str) -> dict[str, int]:
    raw = record.get("verdicts", {})
    if not isinstance(raw, dict):
        raise HistoryError(f"{where}: `verdicts` must be an object, got {type(raw).__name__}")
    out = {}
    for name, value in raw.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
            raise HistoryError(f"{where}: verdict {name!r} must be a non-negative number")
        out[str(name)] = int(round(value))
    return dict(sorted(out.items()))


def load_history(path: str) -> tuple[list[dict], list[str]]:
    """Read every JSON line, skipping (and reporting) the ones that cannot be plotted."""
    rows: list[dict] = []
    skipped: list[str] = []
    if not os.path.exists(path):
        raise HistoryError(f"{path} does not exist; run scripts/check_links.py --history {path}")
    with open(path, "r", encoding="utf-8") as handle:
        for lineno, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            where = f"{os.path.basename(path)}:{lineno}"
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                skipped.append(f"{where}: invalid JSON ({exc.msg})")
                continue
            if not isinstance(record, dict):
                skipped.append(f"{where}: expected a JSON object, got {type(record).__name__}")
                continue
            try:
                stamp = parse_timestamp(record.get("date"), where)
                row = {
                    "date": record["date"].strip(),
                    "epochMs": int(stamp.timestamp() * 1000),
                }
                for key in COUNTS:
                    row[key] = count(record, key, where)
                verdicts = verdicts_of(record, where)
                row["blocked"] = verdicts.get("BLOCKED", 0)
                row["unreachable"] = verdicts.get("UNREACHABLE", 0)
                row["serverError"] = verdicts.get("SERVER_ERROR", 0)
                row["verdicts"] = verdicts
                row["unverified"] = parse_unverified(record, where)
            except HistoryError as exc:
                skipped.append(str(exc))
                continue
            rows.append(row)

    rows.sort(key=lambda r: r["epochMs"])
    return rows, skipped


def render_module(rows: list[dict], skipped: list[str], history_rel: str,
                  recurrence: list[dict], recurrence_runs: int) -> str:
    points = []
    for row in rows:
        points.append(
            {
                "date": row["date"],
                "urls": row["urls"],
                "served": row["served"],
                "notChecked": row["not_checked"],
                "failed": row["failed"],
                "blocked": row["blocked"],
                "unreachable": row["unreachable"],
                "serverError": row["serverError"],
                "verdicts": row["verdicts"],
            }
        )
    return (
        "// Auto-generated by scripts/generate_link_history_data.py — do not edit manually\n"
        "// Source: "
        + history_rel
        + " (one JSON line per link-check run, appended by scripts/check_links.py --history).\n"
        "export interface LinkHistoryPoint {\n"
        "  /** ISO-8601 timestamp of the run, as written by the checker. */\n"
        "  date: string;\n"
        "  /** Unique external URLs cited across tracked Markdown files. */\n"
        "  urls: number;\n"
        "  /** Citations the host served: verdict PASS (HTTP 200). */\n"
        "  served: number;\n"
        "  /** Citations it could not check: BLOCKED + SERVER_ERROR + UNREACHABLE. */\n"
        "  notChecked: number;\n"
        "  /** Citations that answered but failed the check. */\n"
        "  failed: number;\n"
        "  blocked: number;\n"
        "  unreachable: number;\n"
        "  serverError: number;\n"
        "  /** Every verdict name the checker emitted, so a new verdict shows up without a code change. */\n"
        "  verdicts: Record<string, number>;\n"
        "}\n\n"
        "export const LINK_HISTORY_SOURCE = "
        + json.dumps(history_rel)
        + ";\n\n"
        "export const LINK_HISTORY: LinkHistoryPoint[] = "
        + json.dumps(points, indent=2, ensure_ascii=False)
        + ";\n\n"
        "/** History lines the generator could not plot (invalid JSON, missing date). */\n"
        "export const LINK_HISTORY_SKIPPED: string[] = "
        + json.dumps(skipped, indent=2, ensure_ascii=False)
        + ";\n\n"
        "/**\n"
        " * A host the sweep could not verify, counted across runs. `runs` is how many runs listed at\n"
        " * least one of its URLs as unverified; `urls` is how many it lists in the latest run.\n"
        " */\n"
        "export interface HostRecurrence {\n"
        "  host: string;\n"
        "  runs: number;\n"
        "  urls: number;\n"
        "  lastSeen: string;\n"
        "}\n\n"
        "/** Runs whose record carried its unverified URL list; older rows cannot contribute. */\n"
        # Typed `number`, not a literal: the component pluralizes a count the next sweep changes.
        f"export const HOST_RECURRENCE_RUNS: number = {recurrence_runs};\n\n"
        "export const HOST_RECURRENCE: HostRecurrence[] = "
        + json.dumps(recurrence, indent=2, ensure_ascii=False)
        + ";\n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--history", default=DEFAULT_HISTORY, help="append-only JSONL history file")
    parser.add_argument("--out", default=DEFAULT_OUT, help="TS module to write or check")
    parser.add_argument("--check", action="store_true", help="exit 1 when the TS module is out of sync")
    parser.add_argument("--json", action="store_true", help="print a machine-readable summary")
    args = parser.parse_args(argv)

    history_rel = os.path.relpath(args.history, ROOT)
    try:
        rows, skipped = load_history(args.history)
    except HistoryError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    recurrence, recurrence_runs = host_recurrence(rows)
    content = render_module(rows, skipped, history_rel, recurrence, recurrence_runs)
    out_rel = os.path.relpath(args.out, ROOT)

    if args.check:
        if not os.path.exists(args.out):
            print(f"ERROR: {out_rel} does not exist. Run python3 scripts/generate_link_history_data.py", file=sys.stderr)
            return 1
        with open(args.out, "r", encoding="utf-8") as handle:
            existing = handle.read()
        if existing != content:
            print(
                f"ERROR: {out_rel} is out of sync with {history_rel} — "
                "run `python3 scripts/generate_link_history_data.py`.",
                file=sys.stderr,
            )
            return 1
    else:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        # Same directory as the target, so the rename never crosses filesystems.
        tmp = f"{args.out}.tmp.{os.getpid()}"
        with open(tmp, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(tmp, args.out)

    latest = rows[-1]["date"] if rows else None
    if args.json:
        print(
            json.dumps(
                {
                    "runs": len(rows),
                    "latest": latest,
                    "skipped": len(skipped),
                    "out": out_rel,
                    "checked": bool(args.check),
                }
            )
        )
    elif args.check:
        print(f"OK: {out_rel} is in sync with {len(rows)} run(s) in {history_rel}.")
    else:
        print(f"Generated {out_rel} with {len(rows)} run(s) from {history_rel}.")
    for line in skipped:
        print(f"WARN: skipped {line}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
