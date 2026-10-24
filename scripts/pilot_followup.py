#!/usr/bin/env python3
"""Keep the pilot's transfer check from being forgotten.

`docs/PILOT.md` asks the transfer question 7–14 days after the sitting, and only about a concept learned
at least a week before: an immediate question measures memory, not understanding. That delay is exactly
the length at which a promise made to a stranger in a makerspace gets lost. The sheet's `transfer`
column then stays `-` forever, and the pilot reports comprehension it never tested.

So the due date is written down at the sitting, in the participant's own folder, and this script is what
reads it back. It is deliberately not a calendar integration: the pilot runs on one machine, the folders
are already there, and a reminder that needs a service is a reminder that eventually doesn't arrive.

Three commands, one per moment:

- **At the sitting** — `--add` records the lesson that was finished and the day the question falls due,
  defaulting to day 10 (the middle of the window, so a slipped day is still inside it).
- **Every working day for the next month** — `--due` lists who is due, who is overdue, and the folder
  that has an export but no follow-up record at all. That last one is the failure this exists for: a
  participant with no due date is a sitting that will be forgotten, and the exit code says so.
- **After the question** — `--grade` records pass or fail with one line of what they said, which is what
  the `transfer` column and the results page quote.

The window is the protocol's, not a preference: `--days` outside 7–14 is refused, because a transfer
question asked on day 3 or day 30 is a different measurement wearing the same name.

Usage
    python3 scripts/pilot_followup.py --add pilot-data/2026-10-24-ab --lesson P.1
    python3 scripts/pilot_followup.py --add pilot-data/2026-10-24-ab --lesson P.1 --days 12
    python3 scripts/pilot_followup.py --due
    python3 scripts/pilot_followup.py --due --today 2026-11-03
    python3 scripts/pilot_followup.py --grade pilot-data/2026-10-24-ab pass --note "picked the right formula unprompted"

Exit-code family: typed
    0  nothing is due, or the command did what it said
    1  a participant is due, a folder has no follow-up record, or a record is outside the window
    2  the command line, or a folder, could not be used
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "pilot-data")
RECORD = "follow-up.json"
SCHEMA = "mechalab.pilot-followup/1"
EARLIEST_DAYS = 7
LATEST_DAYS = 14
DEFAULT_DAYS = 10


def today() -> dt.date:
    return dt.date.today()


def parse_day(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def record_path(folder: str) -> str:
    return os.path.join(folder, RECORD)


def read_record(folder: str) -> dict | None:
    path = record_path(folder)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_record(folder: str, record: dict) -> None:
    path = record_path(folder)
    # Written beside the export it belongs to, and atomically: a half-written record is a due date that
    # reads as missing, which is the one failure this script exists to prevent.
    temporary = f"{path}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def has_export(folder: str) -> str | None:
    for path in sorted(glob.glob(os.path.join(folder, "mechalab-learning-log-*.json"))):
        return path
    return None


def days_between(earlier: dt.date, later: dt.date) -> int:
    return (later - earlier).days


def status(folder: str, now: dt.date) -> tuple[str, str, int | None]:
    """`(state, message, exit weight)` for one participant folder.

    The states are the ones an operator acts on: `due`, `overdue`, `sleeping` (not yet due), `graded`,
    `unrecorded` (an export with no due date — the sitting that would be forgotten), and `bad` (a record
    this script cannot use).
    """
    name = os.path.basename(os.path.normpath(folder))
    try:
        record = read_record(folder)
    except (OSError, ValueError) as error:
        return "bad", f"{name}: follow-up record cannot be read ({error})", 1
    if record is None:
        export = has_export(folder)
        if not export:
            return "empty", f"{name}: no export and no follow-up record (nothing to follow up yet)", 0
        return (
            "unrecorded",
            f"{name}: export present, no follow-up record — this sitting has no due date, so its transfer will be forgotten",
            1,
        )
    if record.get("schema") != SCHEMA:
        return "bad", f"{name}: follow-up record has schema {record.get('schema')!r}, not {SCHEMA!r}", 1
    lesson = record.get("lesson") or "?"
    try:
        due = parse_day(str(record.get("dueOn")))
        recorded = parse_day(str(record.get("recordedOn")))
    except ValueError:
        return "bad", f"{name}: follow-up record has a date this script cannot read", 1
    window = days_between(recorded, due)
    if not EARLIEST_DAYS <= window <= LATEST_DAYS:
        return (
            "bad",
            f"{name}: due {window} days after the sitting ({lesson}) — the protocol's window is "
            f"{EARLIEST_DAYS}–{LATEST_DAYS}, so this question measures something else",
            1,
        )
    result = record.get("result") or {}
    if result.get("verdict"):
        return (
            "graded",
            f"{name}: {lesson} transfer {result['verdict']} on {result.get('on', '?')}"
            + (f" — {result['note']}" if result.get("note") else ""),
            0,
        )
    waiting = days_between(now, due)
    if waiting > 0:
        return "sleeping", f"{name}: {lesson} due in {waiting} day(s) ({record['dueOn']})", 0
    if waiting == 0:
        return "due", f"{name}: {lesson} due today ({record['dueOn']})", 1
    return "overdue", f"{name}: {lesson} overdue by {-waiting} day(s) ({record['dueOn']})", 1


def folders() -> list[str]:
    return sorted(glob.glob(os.path.join(DATA, "*")))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Keep the pilot's 7–14 day transfer check from being forgotten.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--add", metavar="FOLDER", help="record the due date for one participant folder")
    action.add_argument("--due", action="store_true", help="list who is due, overdue, or has no due date")
    action.add_argument("--grade", metavar="FOLDER", help="record the answer to the transfer question")
    parser.add_argument("--lesson", help="the lesson the sitting finished (with --add)")
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAYS,
        help=f"days until the question is asked, {EARLIEST_DAYS}–{LATEST_DAYS} (default {DEFAULT_DAYS})",
    )
    parser.add_argument("verdict", nargs="?", choices=["pass", "fail"], help="with --grade")
    parser.add_argument("--note", default="", help="one line of what they said (with --grade)")
    parser.add_argument("--today", help="the date to judge by, YYYY-MM-DD (default: today)")
    args = parser.parse_args(argv)

    if args.grade and not args.verdict:
        print("[FAIL] --grade needs a verdict: pass or fail", file=sys.stderr)
        return 2

    try:
        now = parse_day(args.today) if args.today else today()
    except ValueError:
        print(f"[FAIL] --today {args.today!r} is not a YYYY-MM-DD date", file=sys.stderr)
        return 2

    if args.add:
        if not args.lesson:
            print("[FAIL] --add needs --lesson, so the question names what it is about", file=sys.stderr)
            return 2
        if not EARLIEST_DAYS <= args.days <= LATEST_DAYS:
            print(
                f"[FAIL] --days {args.days} is outside the protocol's {EARLIEST_DAYS}–{LATEST_DAYS} day window; "
                "an immediate question measures memory, and a month-later one measures neither",
                file=sys.stderr,
            )
            return 2
        if not os.path.isdir(args.add):
            print(f"[FAIL] {args.add} is not a folder; make it with mkdir -p first", file=sys.stderr)
            return 2
        due = now + dt.timedelta(days=args.days)
        record = {
            "schema": SCHEMA,
            "folder": os.path.basename(os.path.normpath(args.add)),
            "lesson": args.lesson,
            "recordedOn": now.isoformat(),
            "dueOn": due.isoformat(),
            "question": (
                f"Ask about the concept behind {args.lesson}, in your own words, without a screen: "
                "is it the same idea as the one they met there, or a different one wearing the same name?"
            ),
            "result": None,
        }
        try:
            write_record(args.add, record)
        except OSError as error:
            print(f"[FAIL] cannot write {record_path(args.add)}: {error}", file=sys.stderr)
            return 2
        print(f"{os.path.basename(os.path.normpath(args.add))}: {args.lesson} due {due.isoformat()} (day {args.days})")
        return 0

    if args.grade:
        try:
            record = read_record(args.grade)
        except (OSError, ValueError) as error:
            print(f"[FAIL] {args.grade}: follow-up record cannot be read ({error})", file=sys.stderr)
            return 2
        if record is None:
            print(
                f"[FAIL] {args.grade} has no follow-up record; record the due date at the sitting with --add",
                file=sys.stderr,
            )
            return 2
        record["result"] = {"on": now.isoformat(), "verdict": args.verdict, "note": args.note.strip()}
        try:
            write_record(args.grade, record)
        except OSError as error:
            print(f"[FAIL] cannot write {record_path(args.grade)}: {error}", file=sys.stderr)
            return 2
        print(f"{os.path.basename(os.path.normpath(args.grade))}: {record.get('lesson')} transfer {args.verdict}")
        return 0

    # ---- --due: the whole pilot, as of `now` ----
    found = folders()
    if not found:
        print("pilot-data/ has no participant folders yet: nothing to follow up")
        return 0
    standing = [status(folder, now) for folder in found]
    for state, message, _ in standing:
        print(f"  {message}")
    due = [entry for entry in standing if entry[0] in ("due", "overdue")]
    unrecorded = [entry for entry in standing if entry[0] in ("unrecorded", "bad")]
    pending = [entry for entry in standing if entry[0] == "sleeping"]
    graded = [entry for entry in standing if entry[0] == "graded"]
    print(
        f"\n{len(due)} due, {len(unrecorded)} needing a record, {len(pending)} still inside the window, "
        f"{len(graded)} graded"
    )
    if due or unrecorded:
        if due:
            print("       Ask the transfer question, then: python3 scripts/pilot_followup.py --grade <folder> pass|fail")
        if unrecorded:
            print("       A folder with an export and no due date is a sitting that will be forgotten; add one with --add.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
