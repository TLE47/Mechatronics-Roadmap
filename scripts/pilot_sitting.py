#!/usr/bin/env python3
"""The sitting record: where each participant stopped, and what backs the claim.

`docs/BEGINNER_TEST.md` hands the observer a sheet with a free-text cell for "stuck points (time, page,
what they tried)". Free text is fine in the room and useless afterwards: it cannot be counted into the
top-10 table, it cannot be joined to the participant's export, and nothing stops a row from claiming
"finished" for a sitting where nothing was ever verified. `docs/PILOT.md` §3's help budget is a share of
lessons, so the stops have to be records, not prose.

This script is that record. One JSON file per participant, beside their export in the git-ignored
`pilot-data/<date>-<initials>/` folder:

    --new      open the record from the template (background, date, initials — nothing invented)
    --stop     add one stop: the minute, the page, what they tried, and what kind of stuck it was
    --finish   close it, taking `active_minutes` and the hint counts from the export itself
    --debrief  answer the questions the app cannot see, in one command instead of a JSON edit
    --check    read it back and refuse the claims its evidence does not support
    --issue    render the observation ticket from a record, so nothing is retyped by hand
    --status   how many participants there are, counting only folders with an export behind them

The rules `--check` applies are the reason this exists, and each one is a claim the results page must
never be able to make for free:

1. **Finished needs a verified export.** `finished: true` is refused unless the record names an export
   that exists, that export verifies the lesson, and `run_verify` is true. A sitting that ended early
   is recorded as ended, which is a finding, not a failure.
2. **The minutes are the export's.** `active_minutes` must still equal what the export's `sittings`
   add up to, and `overhead_minutes` must equal `elapsed - active`. An estimate typed into the sheet
   is caught the second time anyone looks.
3. **Every stop is a row.** A stop without a minute, a page or a kind is refused; the kind comes from
   the protocol's vocabulary, so the top-10 table can group them.
4. **Nothing is counted without evidence.** `--status` ignores a folder holding a record and no export,
   and says `N = 0` out loud rather than printing an empty table. That is the whole difference between
   a pilot and a claim.

Usage
    python3 scripts/pilot_sitting.py --new pilot-data/2026-10-24-ab --date 2026-10-24
    python3 scripts/pilot_sitting.py --stop pilot-data/2026-10-24-ab --minute 6 --kind link \\
        --page README --tried "scrolled looking for Start" --resolved "author pointed at the heading"
    python3 scripts/pilot_sitting.py --finish pilot-data/2026-10-24-ab --elapsed 40 --person-hint 1
    python3 scripts/pilot_sitting.py --debrief pilot-data/2026-10-24-ab \\
        --understood partly --error-quote "IndexError: list index out of range" \\
        --knew-next no --their-fix "say what the red line means" \\
        --finished no
    python3 scripts/pilot_sitting.py --check pilot-data/2026-10-24-ab
    python3 scripts/pilot_sitting.py --check            # every folder
    python3 scripts/pilot_sitting.py --issue pilot-data/2026-10-24-ab
    python3 scripts/pilot_sitting.py --issue pilot-data/2026-10-24-ab --out /tmp/sitting.md
    python3 scripts/pilot_sitting.py --status

Exit-code family: typed
    0  the command did what it said; a checked record's evidence supports its claims
    1  a record claims something its evidence does not support (read the line)
    2  the command line, a folder, or an export could not be used
"""


from __future__ import annotations

import argparse
import copy
import datetime as dt
import glob
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import pilot_preflight  # noqa: E402  - the export reader, so the two cannot disagree about a field

ROOT = os.path.dirname(SCRIPT_DIR)
DATA = os.path.join(ROOT, "pilot-data")
RECORD = "sitting.json"
SCHEMA = "mechalab.pilot-sitting/1"

# The protocol's vocabulary (`docs/PILOT.md` §4). One of these for every stop, so the top-10 table can
# group them without an editor deciding after the fact what "confusing" meant.
STUCK_KINDS = ("link", "setup", "tool", "instruction", "maths", "error", "bug")
HELP_KINDS = ("none", "hint_1", "hint_2", "solution", "person")
# How well the failure message landed, in the protocol's three words (`docs/PILOT.md` §4).
UNDERSTOOD = ("yes", "partly", "no")
# `docs/PILOT.md` §1's stages. A sitting names the one it belongs to, because the results page counts
# per stage and a stage guessed from a lesson id afterwards would be a different claim.
STAGES = ("smoke", "p1", "p2", "p3")
# The questions only the observer can answer, and where `--debrief` writes each one.
DEBRIEF_FIELDS = (
    "reached_lesson_1",
    "minutes_to_lesson_1",
    "understood_error",
    "knew_next",
    "their_fix",
    "run_verify",
    "finished",
    "finished_minutes",
)
# What a closed, debriefed record should have answered. Printed as a reminder, never filled in.
STILL_WANTED = (
    "reached_lesson_1",
    "minutes_to_lesson_1",
    "first_confusion",
    "understood_error",
    "knew_next",
    "their_fix",
    "run_verify",
    "finished",
)
# The sitting is 40 minutes and stops at 40 even unfinished; a minute beyond this is a typo in the sheet.
LONGEST_MINUTE = 240


def record_path(folder: str) -> str:
    return os.path.join(folder, RECORD)


def read_record(folder: str) -> dict | None:
    path = record_path(folder)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_record(folder: str, record: dict) -> None:
    """Write atomically: a half-written record reads as a sitting that never happened."""
    path = record_path(folder)
    temporary = f"{path}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def find_export(folder: str) -> str | None:
    for path in sorted(glob.glob(os.path.join(folder, "mechalab-learning-log-*.json"))):
        return path
    return None


def folders() -> list[str]:
    return sorted(path for path in glob.glob(os.path.join(DATA, "*")) if os.path.isdir(path))


def new_record(folder: str, day: str, stage: str = "smoke") -> dict:
    return {
        "schema": SCHEMA,
        "date": day,
        "stage": stage,
        "initials": os.path.basename(os.path.normpath(folder)).split("-")[-1],
        "background": {
            "has_coded": None,
            "has_wired": None,
            "beyond_school_maths": None,
            "used_browser_editor": None,
        },
        "device": "",
        "reached_lesson_1": None,
        "minutes_to_lesson_1": None,
        "elapsed_minutes": None,
        "active_minutes": None,
        "overhead_minutes": None,
        "export": None,
        "runs": None,
        "hints_used": None,
        "help": None,
        "verified": None,
        "stops": [],
        "first_confusion": "",
        "run_verify": None,
        "understood_error": "",
        "knew_next": None,
        "finished": None,
        "finished_minutes": None,
        "their_fix": "",
        "course_bug": {"yes": False, "page": "", "line": ""},
        "limits": "",
    }


def parse_day(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def day_from_folder(folder: str) -> str:
    """`pilot-data/2026-10-24-ab/` names its day; a folder that does not is asked for it."""
    head = os.path.basename(os.path.normpath(folder))[:10]
    try:
        parse_day(head)
    except ValueError:
        return ""
    return head


def int_or_none(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


# ------------------------------------------------------------------------------------------------
# Reading a record back: what it claims, and what the evidence supports.
# ------------------------------------------------------------------------------------------------


def evidence(record: dict, folder: str) -> dict:
    """The export this record names, or the one in its folder, and the numbers it holds."""
    named = record.get("export")
    path = os.path.join(folder, named) if named else find_export(folder)
    if not path or not os.path.exists(path):
        return {"path": None, "sheet": None, "fails": []}
    result = pilot_preflight.examine(path)
    fails = [message for severity, message in result["findings"] if severity == "FAIL"]
    return {"path": path, "sheet": result.get("sheet"), "fails": fails}


def audit(folder: str, record: dict) -> tuple[list[str], list[str], list[str]]:
    """`(fails, warnings, notes)` for one record. The fails are the claims to refuse."""
    fails: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []
    name = os.path.basename(os.path.normpath(folder))

    if record.get("schema") != SCHEMA:
        fails.append(f"schema is {record.get('schema')!r}, not {SCHEMA!r}")
    if record.get("stage") not in STAGES:
        fails.append(
            f"`stage` is {record.get('stage')!r}, not one of {', '.join(STAGES)}: the results page "
            "counts per stage, and a stage nobody chose is not a row"
        )
    day = str(record.get("date") or "")
    try:
        parse_day(day)
    except ValueError:
        fails.append(f"date {day!r} is not YYYY-MM-DD")
    else:
        if not name.startswith(day):
            fails.append(f"folder {name} does not start with the sitting's date, {day}")

    stops = record.get("stops")
    if not isinstance(stops, list):
        fails.append("`stops` is not a list")
        stops = []
    for index, stop in enumerate(stops):
        where = f"stop {index + 1}"
        if not isinstance(stop, dict):
            fails.append(f"{where} is not a record")
            continue
        minute = int_or_none(stop.get("minute"))
        if minute is None or minute < 0 or minute > LONGEST_MINUTE:
            fails.append(f"{where} has no minute inside 0–{LONGEST_MINUTE}")
        if not str(stop.get("page") or "").strip():
            fails.append(f"{where} names no page")
        if not str(stop.get("tried") or "").strip():
            fails.append(f"{where} does not say what they tried")
        if stop.get("kind") not in STUCK_KINDS:
            fails.append(
                f"{where} has kind {stop.get('kind')!r}, not one of {', '.join(STUCK_KINDS)}"
            )
    if not stops and record.get("finished") is not None:
        warnings.append("no stop was logged: a 40-minute first sitting with none is worth re-reading")
    if record.get("course_bug", {}).get("yes") and not str(record["course_bug"].get("page") or "").strip():
        fails.append("`course_bug` is yes and names no page, so it becomes no fix")

    # `docs/PILOT.md` §5's first success criterion is *finds the first lesson*, and it is measured by a
    # minute, not by a yes. A yes with no minute is the same claim as a finished sitting with no verified
    # export: true and useless.
    reached = record.get("reached_lesson_1")
    to_lesson = int_or_none(record.get("minutes_to_lesson_1"))
    if reached is not None and not isinstance(reached, bool):
        fails.append(f"`reached_lesson_1` is {reached!r}, not yes or no")
    if reached is True and to_lesson is None:
        fails.append(
            "`reached_lesson_1` is yes with no `minutes_to_lesson_1`: how long it took is the finding, "
            "and a yes on its own cannot be counted"
        )
    if reached is False and record.get("minutes_to_lesson_1") is not None:
        fails.append(
            f"`reached_lesson_1` is no but `minutes_to_lesson_1` says {record.get('minutes_to_lesson_1')}: "
            "one of the two is wrong"
        )
    if record.get("minutes_to_lesson_1") is not None and (
        to_lesson is None or to_lesson < 0 or to_lesson > LONGEST_MINUTE
    ):
        fails.append(f"`minutes_to_lesson_1` is not a whole minute inside 0–{LONGEST_MINUTE}")
    elapsed_before_export = int_or_none(record.get("elapsed_minutes"))
    if to_lesson is not None and elapsed_before_export is not None and to_lesson > elapsed_before_export:
        fails.append(
            f"`minutes_to_lesson_1` says {to_lesson}, longer than the {elapsed_before_export} minutes they "
            "sat: one of the two numbers is wrong"
        )

    help_kind = record.get("help")
    if help_kind is not None and help_kind not in HELP_KINDS:
        fails.append(f"help {help_kind!r} is not one of {', '.join(HELP_KINDS)}")
    if help_kind == "person" and not int_or_none(record.get("person_hints")):
        fails.append("help is `person` with no `person_hints` count: the help budget needs the number")

    found = evidence(record, folder)
    if found["path"] is None:
        if record.get("active_minutes") is not None or record.get("verified") is not None:
            fails.append("the record carries export numbers but no export is in the folder")
        else:
            notes.append("open: no export yet (nothing is claimed, so nothing is counted)")
        return fails, warnings, notes
    for message in found["fails"]:
        fails.append(f"the export says: {message}")
    sheet = found["sheet"]
    if sheet is None:
        return fails, warnings, notes

    if record.get("export") and os.path.basename(found["path"]) != record.get("export"):
        fails.append(
            f"the record names {record.get('export')}, the folder holds {os.path.basename(found['path'])}"
        )

    active = int_or_none(record.get("active_minutes"))
    if active is None:
        fails.append("`active_minutes` is empty: it is measured from the export, not estimated")
    elif active != sheet["active_minutes"]:
        fails.append(
            f"`active_minutes` says {active}, the export's sittings say {sheet['active_minutes']} — "
            "copy the preflight's number, do not estimate it"
        )
    elapsed = int_or_none(record.get("elapsed_minutes"))
    overhead = int_or_none(record.get("overhead_minutes"))
    if elapsed is None:
        fails.append("`elapsed_minutes` is empty: the timer's number is half the pair")
    elif active is not None and overhead is None:
        fails.append("`overhead_minutes` is empty; it is `elapsed - active`, not a guess")
    elif active is not None and overhead is not None and elapsed - active != overhead:
        fails.append(
            f"`overhead_minutes` says {overhead}, but {elapsed} elapsed − {active} active = {elapsed - active}"
        )

    for field in ("runs", "hints_used", "verified"):
        recorded = record.get(field)
        if recorded is not None and recorded != sheet[field]:
            fails.append(f"`{field}` says {recorded!r}, the export says {sheet[field]!r}")

    if record.get("finished") is True:
        if not sheet["verified"]:
            fails.append("`finished` is true but the export verifies nothing: that is a claim, not a result")
        if record.get("run_verify") is not True:
            fails.append("`finished` is true and `run_verify` is not: the graded loop is the finish line")
        minutes = int_or_none(record.get("finished_minutes"))
        if minutes is None or minutes > (elapsed or LONGEST_MINUTE):
            fails.append("`finished_minutes` is missing or longer than the sitting")
    elif record.get("finished") is False:
        notes.append(
            f"ended unfinished at minute {elapsed if elapsed is not None else '?'} — a finding, which is "
            "the point of round 1"
        )
    else:
        notes.append("open: `finished` is not answered yet")

    if help_kind in ("hint_1", "hint_2", "solution") and not sheet["hints_used"]:
        fails.append(f"help is `{help_kind}` but the export records no hint: one of the two is wrong")
    return fails, warnings, notes


def counted(record: dict, folder: str) -> bool:
    """Whether this sitting is a participant yet: an export behind it and every question answered.

    The one predicate both `--check` and `--status` count with, because two counts of the same pilot
    that disagree is how a results page gets a number nobody can trace. `finished: false` counts — a
    sitting that ended early is a finding — and an unanswered `finished` does not.
    """
    return (
        evidence(record, folder)["path"] is not None
        and record.get("active_minutes") is not None
        and record.get("finished") is not None
    )


def report(folder: str, record: dict, fails: list[str], warnings: list[str], notes: list[str]) -> str:
    name = os.path.basename(os.path.normpath(folder))
    stops = record.get("stops") or []
    head = (
        f"{name}  {record.get('date', '?')}  {len(stops)} stop(s) · "
        f"{record.get('active_minutes') if record.get('active_minutes') is not None else '—'} active / "
        f"{record.get('elapsed_minutes') if record.get('elapsed_minutes') is not None else '—'} elapsed min"
    )
    lines = [head]
    for stop in stops:
        lines.append(
            f"  min {stop.get('minute')}  {stop.get('kind')}  {stop.get('page')}: {stop.get('tried')}"
            + (f" → {stop['resolved']}" if stop.get("resolved") else "")
        )
    for note in notes:
        lines.append(f"  [INFO] {note}")
    for message in warnings:
        lines.append(f"  [WARN] {message}")
    for message in fails:
        lines.append(f"  [FAIL] {message}")
    return "\n".join(lines)


# ------------------------------------------------------------------------------------------------
# Rendering the observation ticket from the record.
# ------------------------------------------------------------------------------------------------


def cell(value) -> str:
    """One Markdown table cell: whitespace folded, pipes escaped, and an unrecorded value said out loud."""
    if value is None:
        return "—"
    text = " ".join(str(value).split()).replace("|", "\\|")
    return text or "—"


def yes_no(value) -> str:
    """`yes`, `no`, or `not answered` — never a blank that a reader takes for `no`."""
    return ("yes" if value else "no") if isinstance(value, bool) else "not answered"


def whole(value, suffix: str = "") -> str:
    """A measured number with its unit, or `—`: an empty cell reads as zero in a table."""
    return f"{value}{suffix}" if isinstance(value, int) and not isinstance(value, bool) else "—"


def issue_title(record: dict) -> str:
    """The ticket's title line, from the only two fields it asks for: the day and the background."""
    background = record.get("background") or {}
    said = []
    for key, label in (("has_coded", "coded before"), ("has_wired", "wired before")):
        answer = background.get(key)
        if isinstance(answer, bool):
            said.append(f"{label}: {'yes' if answer else 'no'}")
    return f"[Beginner Sitting] {record.get('date', '?')}: {', '.join(said) or 'background not answered'}"


def render_issue(record: dict, folder: str) -> str:
    """The issue body, section for section, from the record's own fields.

    The headings and the `kind` vocabulary are the template's
    (`.github/ISSUE_TEMPLATE/beginner-session-log.md`), because a stop logged in the room and a ticket
    filed afterwards have to be the same row. `tests/test_pilot_sitting.py` reads both and fails if
    either side moves alone.

    What the record does not hold is rendered as `not answered` or `—`, never filled from the template:
    an empty field is the prompt to go and ask, and a guess typed here would be indistinguishable from a
    measurement by the time the top-10 table is written.
    """
    background = record.get("background") or {}
    stops = record.get("stops") or []
    bug = record.get("course_bug") or {}
    # The folder as the operator named it: a path rewritten to `pilot-data/…` would be a small lie
    # about where the record actually is.

    rows = [
        "**A one-off observation is not a pilot row.** The pilot's row is the `sitting.json` this body was",
        "rendered from; [`docs/PILOT.md`](https://github.com/TLE47/Mechatronics-Roadmap/blob/main/docs/PILOT.md)",
        "§6 says what does not count as a pilot. Publish aggregates only: no names, no screenshots of the",
        "participant, and no quotes without consent.",
        "",
        f"Filed from `{folder.rstrip(os.sep)}/sitting.json` by `python3 scripts/pilot_sitting.py --issue`. The",
        "fields below **are** that record's fields, so this ticket and a pilot row are the same data.",
        "",
        "### 1. Participant background (no identifying details)",
        "",
        "| Question | Record field | Answer |",
        "| :--- | :--- | :--- |",
        f"| Has written code before? | `background.has_coded` | {yes_no(background.get('has_coded'))} |",
        f"| Has wired a circuit before? | `background.has_wired` | {yes_no(background.get('has_wired'))} |",
        "| Maths beyond school arithmetic? | `background.beyond_school_maths` | "
        f"{yes_no(background.get('beyond_school_maths'))} |",
        "| Has used a browser-based code editor before? | `background.used_browser_editor` | "
        f"{yes_no(background.get('used_browser_editor'))} |",
        f"| Device and browser | `device` | {cell(record.get('device'))} |",
        "",
        "### 2. Reaching Lesson 1",
        "",
        "| Question | Record field | Answer |",
        "| :--- | :--- | :--- |",
        f"| Found the first lesson without help? | `reached_lesson_1` | {yes_no(record.get('reached_lesson_1'))} |",
        f"| Time to the first lesson page | `minutes_to_lesson_1` | {whole(record.get('minutes_to_lesson_1'), ' min')} |",
        f"| First confusion (quote) | `first_confusion` | {cell(record.get('first_confusion'))} |",
        "",
        "### 3. Stops",
        "",
        "One row per place they stopped for more than 20 seconds, including the stalls that resolved. The",
        "`kind` is the protocol's vocabulary: "
        + ", ".join(f"`{kind}`" for kind in STUCK_KINDS)
        + ".",
        "",
        "| Minute | Page or lesson | What they tried | kind | Resolved by |",
        "| ---: | :--- | :--- | :--- | :--- |",
    ]
    for stop in stops:
        rows.append(
            f"| {stop.get('minute')} | {cell(stop.get('page'))} | {cell(stop.get('tried'))} | "
            f"`{stop.get('kind')}` | {cell(stop.get('resolved'))} |"
        )
    if not stops:
        rows += ["", "No stop was logged, which for a 40-minute first sitting is worth re-reading."]

    verified = record.get("verified")
    rows += [
        "",
        "### 4. Time, help and the graded loop",
        "",
        "Active minutes are the export's sittings; elapsed is the timer; overhead is the difference.",
        "`--check` refuses a record where the three disagree, so these numbers are not estimates.",
        "",
        "| Question | Record field | Answer |",
        "| :--- | :--- | :--- |",
        f"| Export read by the preflight? | `export` | {cell(record.get('export'))} |",
        "| Active minutes · elapsed minutes · overhead | `active_minutes` · `elapsed_minutes` · "
        f"`overhead_minutes` | {whole(record.get('active_minutes'))} · "
        f"{whole(record.get('elapsed_minutes'))} · {whole(record.get('overhead_minutes'))} |",
        f"| Runs recorded in the log | `runs` | {whole(record.get('runs'))} |",
        f"| In-course hints used | `hints_used` | {whole(record.get('hints_used'))} |",
        f"| Help type | `help` | {cell(record.get('help'))} |",
        f"| Outside hints from you | `person_hints` | {whole(record.get('person_hints'))} |",
        f"| Reached **Run & Verify**? | `run_verify` | {yes_no(record.get('run_verify'))} |",
        f"| Understood the failure message? | `understood_error` | {cell(record.get('understood_error'))} |",
        f"| Knew what to do next? | `knew_next` | {yes_no(record.get('knew_next'))} |",
        f"| Finished Step 1? | `finished` · `finished_minutes` | {yes_no(record.get('finished'))} · "
        f"{whole(record.get('finished_minutes'), ' min')} |",
        "",
        "The export verifies the lesson: "
        + (yes_no(verified) if record.get("export") else "no export is in the folder yet, so nothing is verified")
        + ".",
        "",
        "### 5. The one fix they asked for",
        "",
        "> " + cell(record.get("their_fix")),
        "",
        "### 6. What changed because of this sitting",
        "",
        "Changed by hand after the sitting — the record holds the finding, not the fix.",
        "",
        "- [ ] Page copy updated",
        "- [ ] Generated count or link fixed",
        "- [ ] Error message rewritten",
        "- [ ] Regression test added (name it)",
        "- [ ] Nothing yet — blocked on a decision",
        "",
        "| Question | Record field | Answer |",
        "| :--- | :--- | :--- |",
        f"| Course bug found? | `course_bug.yes` | {yes_no(bug.get('yes'))} |",
        f"| Which page | `course_bug.page` | {cell(bug.get('page'))} |",
        f"| Which line | `course_bug.line` | {cell(bug.get('line'))} |",
        "",
        "### 7. Limits of this sitting",
        "",
        "- Self-selected participant: yes — every sitting here is recruited by hand",
        "- Author present and observing: yes",
        f"- Anything learned from watching rather than counting: {cell(record.get('limits'))}",
    ]
    return "\n".join(rows) + "\n"


# ------------------------------------------------------------------------------------------------
# The commands.
# ------------------------------------------------------------------------------------------------


def cmd_new(folder: str, day: str, force: bool, stage: str = "smoke") -> int:
    os.makedirs(folder, exist_ok=True)
    if read_record(folder) is not None and not force:
        print(f"[FAIL] {folder} already has a {RECORD}; --force overwrites it", file=sys.stderr)
        return 2
    day = day or day_from_folder(folder)
    if not day:
        print(
            f"[FAIL] --date is required: {os.path.basename(os.path.normpath(folder))!r} does not start "
            "with YYYY-MM-DD",
            file=sys.stderr,
        )
        return 2
    try:
        parse_day(day)
    except ValueError:
        print(f"[FAIL] --date {day!r} is not YYYY-MM-DD", file=sys.stderr)
        return 2
    record = new_record(folder, day, stage)
    write_record(folder, record)
    print(f"opened {record_path(folder)} ({stage})")
    print("  Fill the background and device by asking, then log each stop with --stop.")
    return 0


def cmd_stop(folder: str, minute: int, kind: str, page: str, tried: str, resolved: str) -> int:
    record = read_record(folder)
    if record is None:
        print(f"[FAIL] {folder} has no {RECORD}; run --new first", file=sys.stderr)
        return 2
    if kind not in STUCK_KINDS:
        print(f"[FAIL] --kind {kind!r} is not one of {', '.join(STUCK_KINDS)}", file=sys.stderr)
        return 2
    if minute < 0 or minute > LONGEST_MINUTE:
        print(f"[FAIL] --minute {minute} is outside 0–{LONGEST_MINUTE}", file=sys.stderr)
        return 2
    if not page.strip() or not tried.strip():
        print("[FAIL] a stop needs --page and --tried: the table joins pages, not memories", file=sys.stderr)
        return 2
    stop = {"minute": minute, "kind": kind, "page": page.strip(), "tried": tried.strip()}
    if resolved.strip():
        stop["resolved"] = resolved.strip()
    record.setdefault("stops", []).append(stop)
    write_record(folder, record)
    print(f"stop {len(record['stops'])} at minute {minute} ({kind}) on {page}")
    return 0


def cmd_finish(folder: str, elapsed: int, person_hints: int, export: str | None) -> int:
    record = read_record(folder)
    if record is None:
        print(f"[FAIL] {folder} has no {RECORD}; run --new first", file=sys.stderr)
        return 2
    path = export or find_export(folder)
    if not path or not os.path.exists(path):
        print(
            f"[FAIL] no export in {folder}: press Export Learning Log (.json) while they are still there",
            file=sys.stderr,
        )
        return 2
    result = pilot_preflight.examine(path)
    fails = [message for severity, message in result["findings"] if severity == "FAIL"]
    if fails:
        print(f"[FAIL] {os.path.basename(path)} cannot be logged as it stands:", file=sys.stderr)
        for message in fails:
            print(f"       {message}", file=sys.stderr)
        return 2
    sheet = result["sheet"]
    if sheet["active_minutes"] > elapsed:
        print(
            f"[FAIL] the export's sittings say {sheet['active_minutes']} active minutes, more than the "
            f"{elapsed} elapsed you recorded: one of the two numbers is wrong",
            file=sys.stderr,
        )
        return 2

    record["export"] = os.path.basename(path)
    record["active_minutes"] = sheet["active_minutes"]
    record["elapsed_minutes"] = elapsed
    record["overhead_minutes"] = elapsed - sheet["active_minutes"]
    record["runs"] = sheet["runs"]
    record["hints_used"] = sheet["hints_used"]
    record["verified"] = sheet["verified"]
    record["person_hints"] = person_hints
    record["help"] = "person" if person_hints else sheet["help"]
    write_record(folder, record)

    print(f"closed {record_path(folder)}")
    print(
        f"  {record['active_minutes']} active / {record['elapsed_minutes']} elapsed min "
        f"({record['overhead_minutes']} overhead) · {record['runs']} runs · "
        f"hints {record['hints_used']} · help {record['help']} · "
        f"verified {'yes' if record['verified'] else 'no'}"
    )
    if not sheet["verified"]:
        print("  the export verifies nothing: record `finished: false` unless the loop really passed")
    return 0


def cmd_issue(folder: str, out: str) -> int:
    """Render the ticket, refusing a record whose evidence does not support its claims.

    The refusal is the point of doing this from the record rather than by hand: a ticket is public, so a
    row that says *finished* without a verified export would publish a claim the pilot cannot back. The
    body is withheld as well as the exit code, so a half-copied ticket cannot be filed by accident.
    """
    try:
        record = read_record(folder)
    except (OSError, ValueError) as error:
        print(f"[FAIL] {record_path(folder)} cannot be read ({error})", file=sys.stderr)
        return 2
    if record is None:
        print(f"[FAIL] {folder} has no {RECORD}; run --new during the sitting first", file=sys.stderr)
        return 2
    fails, _, _ = audit(folder, record)
    if fails:
        print("[FAIL] the record cannot be filed as it stands:", file=sys.stderr)
        for message in fails:
            print(f"       {message}", file=sys.stderr)
        print("       run --check for the full read", file=sys.stderr)
        return 1

    body = render_issue(record, folder)
    if out and not os.path.isdir(os.path.dirname(os.path.abspath(out)) or "."):
        # Before the body reaches stdout: a half-done `--out` must not look like a successful render.
        print(
            f"[FAIL] {os.path.dirname(os.path.abspath(out))} is not a folder to write {out} into",
            file=sys.stderr,
        )
        return 2
    print(body, end="")
    if out:
        temporary = f"{out}.tmp"
        with open(temporary, "w", encoding="utf-8") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, out)
        print(f"wrote {out}", file=sys.stderr)
    print(f"suggested title: {issue_title(record)}", file=sys.stderr)
    return 0


def answered(value) -> bool:
    """Whether a field has been answered at all — `False` is an answer, `None` and `""` are not."""
    return value is not None and not (isinstance(value, str) and not value.strip())


def understood_text(answer: str, quote: str) -> str:
    """`yes` / `partly` / `no`, with the message in quotes when the observer captured it."""
    quoted = " ".join(quote.split())
    return answer if not quoted else f'{answer} — "{quoted}"'


def cmd_debrief(folder: str, answers: dict) -> int:
    """Answer the questions the app cannot see, in one command instead of a JSON edit.

    These are the answers that turn an export into a row — `understood_error`, `knew_next`,
    `their_fix`, and the graded loop — and hand-editing them into `sitting.json` is how a typo becomes a
    claim. Two rules, both about the order the answers arrive in:

    1. **The export has to be in the folder already.** These answers describe the sitting those numbers
       measured, so they are written after `--finish`, not before it.
    2. **An answer that would make the record unfilable is refused before it is written.** The copy is
       audited first, so `finished: yes` with no graded loop is stopped here rather than at `--check`
       half an hour after the participant has gone.
    """
    try:
        record = read_record(folder)
    except (OSError, ValueError) as error:
        print(f"[FAIL] {record_path(folder)} cannot be read ({error})", file=sys.stderr)
        return 2
    if record is None:
        print(f"[FAIL] {folder} has no {RECORD}; run --new during the sitting first", file=sys.stderr)
        return 2
    if evidence(record, folder)["path"] is None:
        print(
            f"[FAIL] no export in {folder}: press Export Learning Log (.json) and run --finish first, so "
            "these answers land beside the numbers they describe",
            file=sys.stderr,
        )
        return 2

    updated = copy.deepcopy(record)
    if answers.get("understood"):
        updated["understood_error"] = understood_text(answers["understood"], answers.get("error_quote") or "")
    if answers.get("knew_next") is not None:
        updated["knew_next"] = answers["knew_next"]
    if answers.get("their_fix") is not None:
        updated["their_fix"] = " ".join(answers["their_fix"].split())
    if answers.get("run_verify") is not None:
        updated["run_verify"] = answers["run_verify"]
    if answers.get("finished") is not None:
        updated["finished"] = answers["finished"]
        if not answers["finished"]:
            # A sitting that ended early has no finish minute; a leftover one would read as a time.
            updated["finished_minutes"] = None
    if answers.get("finished_minutes") is not None:
        updated["finished_minutes"] = answers["finished_minutes"]
    if answers.get("reached_lesson_1") is not None:
        updated["reached_lesson_1"] = answers["reached_lesson_1"]
        if not answers["reached_lesson_1"]:
            # Never found it, so there is no minute to keep; a leftover one would read as a slow find.
            updated["minutes_to_lesson_1"] = None
    if answers.get("minutes_to_lesson_1") is not None:
        updated["minutes_to_lesson_1"] = answers["minutes_to_lesson_1"]

    before, _, _ = audit(folder, record)
    after, _, _ = audit(folder, updated)
    new = [message for message in after if message not in before]
    if new:
        print("[FAIL] these answers would make the record unfilable:", file=sys.stderr)
        for message in new:
            print(f"       {message}", file=sys.stderr)
        print("       nothing was written; the record is as it was", file=sys.stderr)
        return 1

    write_record(folder, updated)
    changed = [field for field in DEBRIEF_FIELDS if updated.get(field) != record.get(field)]
    print(f"recorded {', '.join('`' + field + '`' for field in changed) or 'nothing'} in {record_path(folder)}")
    wanted = [
        field
        for field in STILL_WANTED
        if not answered(updated.get(field)) and not (field == "run_verify" and updated.get("finished") is False)
    ]
    if wanted:
        print(f"  still unanswered: {', '.join('`' + field + '`' for field in wanted)}")
        if updated.get("finished") is None and "finished" in wanted:
            print("  `--check` will not count this sitting as a participant until `finished` is answered")
    else:
        print("  every post-sitting answer is in place: run --check, then --issue")
    return 0


def cmd_check(targets: list[str], as_json: bool) -> int:
    paths = targets or folders()
    if not paths:
        if as_json:
            print(json.dumps({"sittings": [], "failures": 0, "participants": 0}, indent=2))
        else:
            print("[PASS] no sitting records yet — N (non-author) = 0, and nothing is claimed")
        return 0

    reports = []
    failures = 0
    participants = 0
    for folder in paths:
        try:
            record = read_record(folder)
        except (OSError, ValueError) as error:
            message = f"{RECORD} cannot be read ({error})"
            failures += 1
            reports.append({"folder": folder, "fails": [message], "warnings": [], "notes": [], "counted": False})
            continue
        if record is None:
            continue
        fails, warnings, notes = audit(folder, record)
        is_counted = counted(record, folder)
        participants += 1 if is_counted else 0
        failures += len(fails)
        reports.append(
            {
                "folder": folder,
                "record": record,
                "fails": fails,
                "warnings": warnings,
                "notes": notes,
                "counted": is_counted,
            }
        )

    if as_json:
        print(json.dumps({"sittings": reports, "failures": failures, "participants": participants}, indent=2, default=str))
        return 1 if failures else 0

    for entry in reports:
        if "record" not in entry:
            print(f"{os.path.basename(entry['folder'])}")
            for message in entry["fails"]:
                print(f"  [FAIL] {message}")
            continue
        print(report(entry["folder"], entry["record"], entry["fails"], entry["warnings"], entry["notes"]))
        print()
    if failures:
        print(f"[FAIL] {failures} claim(s) the evidence does not support; the row cannot be filed as written")
        return 1
    print(f"[PASS] {len(reports)} sitting record(s), {participants} counted participant(s)")
    return 0


def cmd_status(as_json: bool) -> int:
    """How many participants there are, counting only folders with an export behind them."""
    counted_participants = []
    unbacked = []
    open_records = []
    for folder in folders():
        try:
            record = read_record(folder)
        except (OSError, ValueError):
            unbacked.append((folder, "record cannot be read"))
            continue
        if record is None:
            continue
        if not evidence(record, folder)["path"]:
            unbacked.append((folder, "record with no export"))
        elif not counted(record, folder):
            open_records.append(folder)
        else:
            counted_participants.append((folder, record))

    if as_json:
        print(
            json.dumps(
                {
                    "participants": len(counted_participants),
                    "open": open_records,
                    "unbacked": [folder for folder, _ in unbacked],
                },
                indent=2,
            )
        )
        return 1 if unbacked else 0

    for folder, why in unbacked:
        print(f"  [FAIL] {os.path.basename(os.path.normpath(folder))}: {why} — not counted")
    for folder in open_records:
        print(f"  [INFO] {os.path.basename(os.path.normpath(folder))}: open, not counted yet")
    if not counted_participants:
        print("[PASS] N (non-author) = 0 — no sitting has an export and a finished row behind it yet, so")
        print("       docs/pilot-results.md stays the template it says it is")
        return 1 if unbacked else 0
    print(f"N (non-author) = {len(counted_participants)}")
    for folder, record in counted_participants:
        print(
            f"  {os.path.basename(os.path.normpath(folder))}  {record.get('date')}  "
            f"{len(record.get('stops') or [])} stop(s)  finished {'yes' if record.get('finished') else 'no'}"
        )
    return 1 if unbacked else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Record where each beginner sitting stopped, and refuse claims the evidence does not support."
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--new", metavar="FOLDER", help="open a sitting record in the participant's folder")
    action.add_argument("--stop", metavar="FOLDER", help="append one stop to a sitting record")
    action.add_argument("--finish", metavar="FOLDER", help="close the record, taking the export's numbers")
    action.add_argument("--debrief", metavar="FOLDER", help="answer what the export cannot see, in one command")
    action.add_argument("--check", nargs="*", metavar="FOLDER", help="audit one folder, or every folder")
    action.add_argument("--issue", metavar="FOLDER", help="render the observation ticket from a record")
    action.add_argument("--status", action="store_true", help="how many participants there are, with evidence")

    parser.add_argument("--date", default="", help="the sitting's day, YYYY-MM-DD (with --new; default: the folder's)")
    parser.add_argument(
        "--stage", choices=STAGES, default="smoke", help="which pilot stage this sitting belongs to (with --new)"
    )
    parser.add_argument("--force", action="store_true", help="overwrite an existing record (with --new)")
    parser.add_argument("--minute", type=int, help="minutes into the sitting (with --stop)")
    parser.add_argument("--kind", help=f"one of {', '.join(STUCK_KINDS)} (with --stop)")
    parser.add_argument("--page", default="", help="the page or lesson they were on (with --stop)")
    parser.add_argument("--tried", default="", help="what they tried, in one line (with --stop)")
    parser.add_argument("--resolved", default="", help="what unblocked it, in one line (with --stop)")
    parser.add_argument("--elapsed", type=int, help="wall-clock minutes from sitting down to stopping (with --finish)")
    parser.add_argument("--person-hint", type=int, default=0, help="outside hints from you, 0–3 (with --finish)")
    parser.add_argument("--export", help="the export file, if it is not the one in the folder (with --finish)")
    parser.add_argument("--out", default="", help="also write the ticket body to this file (with --issue)")
    parser.add_argument("--understood", choices=UNDERSTOOD, help="did they understand the failure message (with --debrief)")
    parser.add_argument("--error-quote", default="", help="the message itself, quoted (with --understood)")
    parser.add_argument("--knew-next", choices=("yes", "no"), help="did they know what to do next (with --debrief)")
    parser.add_argument("--their-fix", help="the one fix they asked for, in their words (with --debrief)")
    parser.add_argument("--run-verify", choices=("yes", "no"), help="did they reach Run & Verify (with --debrief)")
    parser.add_argument("--finished", choices=("yes", "no"), help="did they finish Step 1 (with --debrief)")
    parser.add_argument("--finished-minutes", type=int, help="the minute they finished at (with --finished yes)")
    parser.add_argument(
        "--reached-lesson-1", choices=("yes", "no"), help="did they find the first lesson unaided (with --debrief)"
    )
    parser.add_argument(
        "--minutes-to-lesson-1", type=int, help="minutes to the first lesson page (with --reached-lesson-1 yes)"
    )
    parser.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    args = parser.parse_args(argv)

    if args.new:
        return cmd_new(args.new, args.date, args.force, args.stage)

    if args.stop:
        missing = [name for name in ("minute", "kind") if getattr(args, name) is None]
        if missing:
            print(
                f"[FAIL] --stop needs --{' and --'.join(missing)} (plus --page and --tried)",
                file=sys.stderr,
            )
            return 2
        return cmd_stop(args.stop, args.minute, args.kind, args.page, args.tried, args.resolved)

    if args.finish:
        if args.elapsed is None:
            print("[FAIL] --finish needs --elapsed: the timer's number is half the pair", file=sys.stderr)
            return 2
        if args.elapsed < 0:
            print("[FAIL] --elapsed cannot be negative", file=sys.stderr)
            return 2
        if not 0 <= args.person_hint <= 3:
            print("[FAIL] --person-hint is 0–3, the sheet's own range", file=sys.stderr)
            return 2
        return cmd_finish(args.finish, args.elapsed, args.person_hint, args.export)

    if args.issue:
        if args.out and not args.out.strip():
            print("[FAIL] --out needs a path", file=sys.stderr)
            return 2
        return cmd_issue(args.issue, args.out)

    if args.debrief:
        if args.error_quote and not args.understood:
            print(
                "[FAIL] --error-quote needs --understood: the quote says which answer it belongs to",
                file=sys.stderr,
            )
            return 2
        if args.finished_minutes is not None and args.finished is None:
            print(
                "[FAIL] --finished-minutes needs --finished: a minute is a finish line only if they finished",
                file=sys.stderr,
            )
            return 2
        if args.minutes_to_lesson_1 is not None and args.reached_lesson_1 != "yes":
            print(
                "[FAIL] --minutes-to-lesson-1 needs --reached-lesson-1 yes: a find that did not happen has no "
                "minute",
                file=sys.stderr,
            )
            return 2
        answers = {
            "understood": args.understood,
            "error_quote": args.error_quote,
            "knew_next": None if args.knew_next is None else args.knew_next == "yes",
            "their_fix": args.their_fix,
            "run_verify": None if args.run_verify is None else args.run_verify == "yes",
            "finished": None if args.finished is None else args.finished == "yes",
            "finished_minutes": args.finished_minutes,
            "reached_lesson_1": None if args.reached_lesson_1 is None else args.reached_lesson_1 == "yes",
            "minutes_to_lesson_1": args.minutes_to_lesson_1,
        }
        if not any(
            answers[key] is not None and answers[key] != ""
            for key in ("understood", "knew_next", "their_fix", "run_verify", "finished", "reached_lesson_1")
        ):
            print(
                "[FAIL] --debrief needs at least one answer: --reached-lesson-1, --understood, --knew-next, "
                "--their-fix, --run-verify or --finished",
                file=sys.stderr,
            )
            return 2
        return cmd_debrief(args.debrief, answers)

    if args.check is not None:
        return cmd_check(args.check, args.json)

    return cmd_status(args.json)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
