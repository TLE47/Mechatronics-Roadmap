#!/usr/bin/env python3
"""File one GitHub issue for a link sweep that failed its rise gate, naming the new URLs.

The weekly sweep already fails when a URL is unverified now and was not in the last recorded row,
but the evidence lands in a workflow log a maintainer has to go looking for. This turns that log
line into a tracked issue: one issue per distinct set of new URLs, with each URL's verdict, what
the host said, and the files that cite it.

Deduplication is by content, not by date: the body carries `<!-- rise-fingerprint: … -->`, a hash
of the sorted new URLs. If an open issue already carries that marker the rise is already tracked
and nothing is filed — so a re-run of the same sweep (or a retried job) cannot open a second issue.
When the next sweep clears the wall, the set changes, so the marker changes too; the old issue stays
open until a human closes it, which is the point of filing it.

Usage in CI (after a failed gate):
    python3 scripts/file_rise_issue.py --report .sweep-state.json

Run: `python3 tests/test_rise_issue.py` for the decision logic; `--dry-run` prints the `gh`
commands instead of running them.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import subprocess
import sys

LABEL = "link-rise"
MARKER = "rise-fingerprint:"
URL_MARKER = "rise-urls:"
REPORT_DEFAULT = ".sweep-state.json"


def fingerprint(urls: list[str]) -> str:
    """A stable 12-hex id for a set of URLs: order does not matter, membership does."""
    joined = "\n".join(sorted(urls))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:12]


def issue_title(report: dict) -> str:
    count = len(report.get("new", []))
    noun = "URL" if count == 1 else "URLs"
    return f"Link sweep rise: {count} newly unverified {noun}"


def issue_urls(body: str) -> list[str]:
    """The URLs an issue tracks, read back from its `<!-- rise-urls: [...] -->` marker.

    The fingerprint alone says *which* set an issue tracks but not what is in it, and closing on
    recovery needs the membership. Issues filed before the marker existed return an empty list and
    are left alone rather than guessed at.
    """
    match = re.search(re.escape("<!-- " + URL_MARKER) + r"\s*(.*?)\s*-->", str(body), re.S)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except ValueError:
        return []
    return [str(url) for url in data] if isinstance(data, list) else []


def issue_body(report: dict, mark: str) -> str:
    """The issue as a maintainer needs it: what rose, what each host said, and where it is cited."""
    rows = [
        "| URL | Verdict | Host said | Cited in |",
        "| :--- | :--- | :--- | :--- |",
    ]
    for row in report.get("new", []):
        # The checker formats these with backticks already; strip before re-wrapping so the table
        # renders one code span, not an empty one around a code span.
        sources = ", ".join(f"`{str(source).strip('`')}`" for source in row.get("sources", [])) or "—"
        status = str(row.get("status") or "—").replace("|", "\\|")
        rows.append(f"| {row.get('url', '')} | `{row.get('verdict', '')}` | {status} | {sources} |")

    baseline = report.get("baseline_date") or "no comparable row"
    return "\n".join([
        "The scheduled link sweep found URL(s) unverified now that the last recorded sweep "
        "did not list. Each one is either a page that stopped being served or a host that now "
        "walls scripts; the two need different responses.",
        "",
        f"<!-- {MARKER} {mark} -->",
        f"<!-- {URL_MARKER} {json.dumps(sorted(row.get('url', '') for row in report.get('new', []))) } -->",
        "",
        f"- **Sweep:** {report.get('date') or '?'} (baseline: {baseline})",
        f"- **Checked:** {report.get('urls', 0)} URLs, {report.get('not_checked', 0)} not verified",
        "",
        *rows,
        "",
        "**Likely cause:** a `BLOCKED` verdict (403/429) is a bot wall and usually opens in a "
        "browser; `UNREACHABLE` with a DNS error is a dead citation; a timeout is retried within "
        "six hours by the sweep and may clear on its own.",
        "",
        "**What to check:** open each URL in a browser, then either replace the citation or annotate "
        "it in `docs/UNVERIFIED_CITATIONS.md` the way an outage is annotated. A wall that lifts "
        "closes this issue with no change; a dead page needs the citation repaired.",
        "",
        "Reproduce:",
        "",
        "```",
        "python3.12 scripts/check_links.py --fail-on-rise --history docs/link-check-history.jsonl "
        "--sweep-state .sweep-state.json",
        "```",
    ])


def find_duplicate(issues: list[dict], mark: str) -> int | None:
    """The number of an open issue already tracking this exact set, or None."""
    needle = f"{MARKER} {mark}"
    for issue in issues:
        if needle in str(issue.get("body", "")):
            return int(issue.get("number", 0))
    return None


def gh(args: list[str]) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or f"gh {' '.join(args)} failed")
    return result.stdout


def ensure_label(dry_run: bool) -> None:
    """`gh issue create --label` fails on a missing label, so create it and ignore 'already exists'."""
    command = ["label", "create", LABEL, "--color", "D93F0B",
               "--description", "A URL the weekly link sweep could not verify"]
    if dry_run:
        print("gh " + " ".join(command))
        return
    result = subprocess.run(["gh", *command], capture_output=True, text=True)
    if result.returncode != 0 and "already exists" not in (result.stderr or ""):
        raise RuntimeError((result.stderr or "").strip() or "could not create the link-rise label")


def plan_resolution(issues: list[dict], current: set[str]) -> tuple[list, list, list]:
    """Split open rise issues into (closable, still-open-with-counts, legacy) against this sweep.

    Closable means every URL the issue tracks is served (or otherwise not in `unverified`) now.
    `current` comes from the sweep's own state, not from re-fetching: the sweep and the resolver must
    describe the same run, or an issue could close on evidence the run never collected.
    """
    closable, kept, legacy = [], [], []
    for issue in issues:
        urls = issue_urls(issue.get("body", ""))
        if not urls:
            legacy.append(issue)
            continue
        still = [url for url in urls if url in current]
        if still:
            kept.append((issue, len(still), len(urls)))
        else:
            closable.append((issue, urls))
    return closable, kept, legacy


def state_datetime(report: dict) -> datetime.datetime | None:
    """The sweep's timestamp as an aware UTC datetime, or None when the state cannot be trusted."""
    raw = report.get("date")
    if not isinstance(raw, str):
        return None
    try:
        stamp = datetime.datetime.fromisoformat(raw)
    except ValueError:
        return None
    return stamp.replace(tzinfo=datetime.timezone.utc) if stamp.tzinfo is None else stamp


def parse_now(value: str) -> datetime.datetime:
    """An ISO 8601 instant as aware UTC, so `now - stamp` never mixes naive and aware datetimes."""
    stamp = datetime.datetime.fromisoformat(value)
    return stamp.replace(tzinfo=datetime.timezone.utc) if stamp.tzinfo is None else stamp


def load_issues(args) -> list[dict] | None:
    """Open `link-rise` issues, from `--existing` when given, otherwise from `gh`."""
    if args.existing:
        with open(args.existing, "r", encoding="utf-8") as handle:
            return json.load(handle)
    try:
        ensure_label(args.dry_run)
        return json.loads(gh([
            "issue", "list", "--label", LABEL, "--state", "open",
            "--json", "number,body", "--limit", "100",
        ]) or "[]")
    except (RuntimeError, ValueError) as exc:
        print(f"ERROR: could not read open {LABEL} issues: {exc}", file=sys.stderr)
        return None


def resolve(report: dict, issues: list[dict], args) -> int:
    """Close every open rise issue whose URLs are no longer unverified; report the rest."""
    if not isinstance(report.get("unverified"), list):
        print(
            "ERROR: the sweep state carries no `unverified` list, so there is no evidence to close "
            "an issue on; nothing was closed.",
            file=sys.stderr,
        )
        return 2
    now = args.now
    stamp = state_datetime(report)
    if stamp is None:
        print("ERROR: the sweep state has no readable date; nothing was closed.", file=sys.stderr)
        return 2
    age_hours = (now - stamp).total_seconds() / 3600
    if age_hours > args.max_state_hours:
        print(
            f"ERROR: the sweep state is {age_hours:.1f} h old (limit {args.max_state_hours:g}); a "
            f"stale state could close an issue for a URL this run never checked, so nothing was "
            f"closed.",
            file=sys.stderr,
        )
        return 2

    current = {str(url) for url in report["unverified"]}
    closable, kept, legacy = plan_resolution(issues, current)
    for issue, still, total in kept:
        print(f"Issue #{issue.get('number')}: {still} of {total} URL(s) still unverified; keeping it open.")
    for issue in legacy:
        print(
            f"Issue #{issue.get('number')}: no rise-urls marker (filed before it existed); leaving it "
            f"for a human to close."
        )
    for issue, urls in closable:
        comment = (
            f"All {len(urls)} URL(s) this issue tracked were verified again in the "
            f"{report.get('date')} sweep."
        )
        command = ["issue", "close", str(issue.get("number")), "--reason", "completed",
                   "--comment", comment]
        if args.dry_run:
            print("gh " + " ".join(command))
            continue
        try:
            gh(command)
            print(f"Closed issue #{issue.get('number')} ({len(urls)} URL(s) verified again).")
        except RuntimeError as exc:
            print(f"ERROR: could not close issue #{issue.get('number')}: {exc}", file=sys.stderr)
            return 1
    if not closable:
        print("No rise issue had all of its URLs verified again; nothing closed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="File or resolve issues for a link-sweep rise gate.")
    parser.add_argument("--report", default=REPORT_DEFAULT, help=f"the sweep's JSON state (default {REPORT_DEFAULT})")
    parser.add_argument("--dry-run", action="store_true", help="Print the gh commands instead of running them")
    parser.add_argument(
        "--resolve",
        action="store_true",
        help="Close open link-rise issues whose URLs all verify again in this sweep",
    )
    parser.add_argument(
        "--max-state-hours",
        type=float,
        default=6.0,
        help="Refuse a sweep state older than this, in hours (default 6, the unverified cache window)",
    )
    parser.add_argument(
        "--now",
        type=parse_now,
        default=datetime.datetime.now(datetime.timezone.utc),
        help="Treat this time as now (ISO 8601); for tests and backfills",
    )
    parser.add_argument(
        "--existing",
        default=None,
        help="Read open issues from this JSON file instead of calling `gh issue list` (tests, offline runs)",
    )
    args = parser.parse_args(argv)

    try:
        with open(args.report, "r", encoding="utf-8") as handle:
            report = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"No sweep state at {args.report} ({exc}); nothing to do.", file=sys.stderr)
        return 2

    if args.resolve:
        issues = load_issues(args)
        return 1 if issues is None else resolve(report, issues, args)

    urls = [str(row.get("url", "")) for row in report.get("new", []) if row.get("url")]
    if not urls:
        print("The sweep state lists no new URLs; nothing to file.", file=sys.stderr)
        return 2

    mark = fingerprint(urls)
    title = issue_title(report)
    body = issue_body(report, mark)
    issues = load_issues(args)
    if issues is None:
        return 1

    duplicate = find_duplicate(issues, mark)
    if duplicate is not None:
        print(f"Already tracked by issue #{duplicate} ({mark}); nothing filed.")
        return 0

    command = ["issue", "create", "--title", title, "--body", body, "--label", LABEL]
    if args.dry_run:
        print("gh " + " ".join(command[:4]) + " <body> " + " ".join(command[4:]))
        print(f"Would file: {title} ({mark})")
        return 0
    try:
        created = gh(command).strip()
    except RuntimeError as exc:
        print(f"ERROR: could not file the issue: {exc}", file=sys.stderr)
        return 1
    print(f"Filed {created} for {len(urls)} new URL(s) ({mark}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
