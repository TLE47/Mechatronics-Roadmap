#!/usr/bin/env python3
"""Fail on a workflow file GitHub would refuse to parse - on the contributor's machine, not in CI.

`ci.yml` carried two step names of the form `Check light/dark: toggle contract`, with the `: `
left unquoted. YAML reads that second colon as another mapping, so the file did not parse at all,
and GitHub reported it the worst possible way: a run that goes `failure` in 0 s with no jobs, no
logs, and nothing naming the file. Every push to `main` from the commit that added the first of
them was throwing away a full round trip, and the local gate that is supposed to run CI's checks
before a push could not see it either, because it runs the checks *inside* a workflow the runner
never got to start.

The rule that was broken is a plain one: in an unquoted scalar, `:` is only legal when it is not
followed by a space, and `#` only when it is not preceded by one. So the scan below needs no YAML
parser - PyYAML is not a dependency of this repo, and adding one to catch a parse error would be
the tail wagging the dog. It reads each line, skips the parts of a file where the rule does not
apply (block scalars, quoted scalars, flow collections, comments), and reports a value that a
parser would split in two.

It also runs `actionlint` when the binary is on PATH - the full lint, against the same files, as a
second opinion whose findings are fatal too. That half is optional because GitHub's runners do not
preinstall it; the scan above is the part that has to hold everywhere, and it is the part that
would have caught the `Check light/dark:` line.

Usage:
    python3 scripts/check_workflows.py             # every workflow, exit 1 on findings
    python3 scripts/check_workflows.py ci.yml      # just one (a path or a bare name)
    python3 scripts/check_workflows.py --json      # the same, machine-readable
    python3 scripts/check_workflows.py --no-actionlint   # the scan alone

Exit-code family: typed
    0  every workflow parses, and actionlint (when installed) found nothing
    1  a finding
    2  a path that names no workflow file
"""

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS = os.path.join(ROOT, ".github", "workflows")

# `run: |`, `run: |-`, `run: >-`, and the numbered forms; a block scalar head may carry a comment.
BLOCK_HEADER = re.compile(r"^[|>](?:[+-]?[1-9]?[+-]?)?\s*(?:#.*)?$")

# A value that starts with one of these is read as something other than the text it looks like:
# a sequence, an explicit key, a tag, an anchor, an alias, or a reserved indicator.
INDICATORS = {
    "- ": "a block sequence cannot start on the key's own line; put `- ` on the next line",
    "? ": "`? ` starts an explicit key, not a value",
    ": ": "`: ` starts another mapping",
    "* ": "`*` starts an alias",
    "& ": "`&` starts an anchor",
}


def strip_comment(value):
    """The value up to a ` #`, outside quotes; `#` only opens a comment after a space."""
    match = re.search(r"\s#", value)
    return value[: match.start()] if match else value


def closing_quote(value):
    """Index of the quote that closes the one at position 0, or None if the line never closes it."""
    quote = value[0]
    index = 1
    while index < len(value):
        char = value[index]
        if quote == '"' and char == "\\":
            index += 2
            continue
        if char == quote:
            if quote == "'" and value[index + 1 : index + 2] == "'":
                index += 2
                continue
            return index
        index += 1
    return None


def depth_delta(text):
    """How many `[`/`{` a line opens, ignoring those inside quotes and comments."""
    depth = 0
    quote = None
    index = 0
    while index < len(text):
        char = text[index]
        if quote:
            if quote == '"' and char == "\\":
                index += 2
                continue
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
        elif char == "#":
            break
        index += 1
    return depth


def split_entry(body):
    """`key: value` -> (key, value); None when the line is not a mapping entry.

    The separator is the first colon followed by a space or the end of the line, which is the same
    test YAML applies: `run: npm run check:native` keeps its `check:native` in the value.
    """
    for index, char in enumerate(body):
        if char == ":" and (index + 1 == len(body) or body[index + 1] in " \t"):
            return body[:index].strip(), body[index + 1 :].strip()
    return None


def scan_value(value):
    """Classify a value and return (kind, finding-or-None, flow-depth)."""
    if not value:
        return "empty", None, 0
    if value[0] in "\"'":
        close = closing_quote(value)
        if close is None:
            return "quoted", "a quoted value is never closed on its line", 0
        trailer = value[close + 1 :].strip()
        if trailer and not trailer.startswith("#"):
            return "quoted", "text after the closing quote: %r" % trailer[:60], 0
        return "quoted", None, 0
    if value[0] in "|>":
        if BLOCK_HEADER.match(value):
            return "block", None, 0
        return "plain", "a `|`/`>` block header must be the indicator alone, got %r" % value[:40], 0
    if value[0] in "[{":
        depth = depth_delta(value)
        if depth < 0:
            return "flow", "an unbalanced `]`/`}` closes a collection that was never opened", 0
        return "flow", None, depth
    if value[0] in "@`%":
        return "plain", "a value cannot start with the reserved indicator %r" % value[0], 0
    for indicator, reason in INDICATORS.items():
        if value.startswith(indicator):
            return "plain", reason, 0
    text = strip_comment(value).rstrip()
    if not text:
        return "plain", None, 0
    if ": " in text or text.endswith(":"):
        return (
            "plain",
            "unquoted `: ` in a value - YAML reads the second colon as another mapping: %r"
            % text[:80],
            0,
        )
    return "plain", None, 0


def scan_workflow(path):
    """Findings for one workflow file: the lines a YAML parser would refuse."""
    # A path outside the repo (what the tests hand it) has no useful relative form.
    relative = os.path.relpath(path, ROOT)
    if relative.startswith(".."):
        relative = path
    findings = []
    seen = {}  # key column -> {key: line}, for the duplicate-key check
    block_column = None  # indentation of the key whose block scalar we are inside
    flow = 0
    top_level = set()

    with open(path, encoding="utf-8") as handle:
        lines = handle.read().splitlines()

    for number, line in enumerate(lines, 1):
        stripped = line.strip()
        lead = len(line) - len(line.lstrip(" "))

        # A block scalar's body is text, not YAML: `echo "a: b"` is legal in there.
        if block_column is not None:
            if not stripped or lead > block_column:
                continue
            block_column = None
        # A flow collection may span lines: only balance it until it closes.
        if flow > 0:
            flow += depth_delta(line)
            if flow < 0:
                findings.append("%s:%d an unbalanced `]`/`}` closes a collection that was never opened" % (relative, number))
                flow = 0
            continue

        if not stripped or stripped.startswith("#") or stripped in ("---", "..."):
            continue
        if re.match(r"^ *\t", line):
            findings.append(
                "%s:%d tab indentation - YAML forbids tabs in indentation" % (relative, number)
            )
            lead = len(line) - len(line.lstrip(" \t"))

        body = line[lead:]
        column = lead
        # A sequence item: `- name: x`, `- - x`. Its keys start after the dash.
        while body.startswith("- ") or body == "-":
            body = body[1:].lstrip(" ")
            column = len(line) - len(body)
            for key in [key for key in seen if key > lead]:
                del seen[key]
        if not body or body.startswith("#"):
            continue

        entry = split_entry(body)
        if entry is None:
            continue  # a bare scalar on its own line: nothing to check here
        key, value = entry
        if not key:
            continue

        for deeper in [depth for depth in seen if depth > column]:
            del seen[deeper]
        if key in seen.get(column, {}):
            findings.append(
                "%s:%d `%s` is set twice in the same mapping (first on line %d)"
                % (relative, number, key, seen[column][key])
            )
        seen.setdefault(column, {})[key] = number
        if column == 0:
            top_level.add(key)

        kind, finding, depth = scan_value(value)
        if finding:
            findings.append("%s:%d %s" % (relative, number, finding))
        if kind == "block":
            block_column = column
        if kind == "flow":
            flow = depth

    if flow > 0:
        findings.append("%s a `[`/`{` collection is never closed" % relative)
    for required in ("on", "jobs"):
        if required not in top_level:
            findings.append(
                "%s has no top-level `%s:` - GitHub rejects a workflow without it" % (relative, required)
            )
    return findings


def run_actionlint(paths):
    """actionlint's findings, or None when the binary is not installed."""
    binary = shutil.which("actionlint")
    if not binary:
        return None
    try:
        proc = subprocess.run(
            [binary, "-no-color", "--", *paths],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return ["actionlint could not run: %s" % error]
    if proc.returncode == 0:
        return []
    lines = [line.strip() for line in (proc.stdout or proc.stderr).splitlines() if line.strip()]
    return ["actionlint: " + line for line in lines] or [
        "actionlint exited %d with no output" % proc.returncode
    ]


def resolve(names):
    """Workflow paths from bare names or paths, in a stable order."""
    found = sorted(glob.glob(os.path.join(WORKFLOWS, "*.y*ml")))
    missing = []
    if not names:
        return found, missing
    wanted = []
    for name in names:
        candidate = name if os.path.isabs(name) else os.path.join(ROOT, name)
        if os.path.isfile(candidate):
            wanted.append(candidate)
            continue
        matches = [path for path in found if os.path.basename(path) in (name, name + ".yml", name + ".yaml")]
        if matches:
            wanted.extend(matches)
        else:
            missing.append(name)
    return wanted, missing


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Fail on a workflow file GitHub would refuse to parse.",
        epilog="Exit-code family: typed (0 clean, 1 a finding, 2 a name that matches no workflow).",
    )
    parser.add_argument("workflow", nargs="*", help="a workflow file or bare name (default: every workflow)")
    parser.add_argument("--json", action="store_true", help="print findings as JSON")
    parser.add_argument("--no-actionlint", action="store_true", help="run the built-in scan only")
    parser.add_argument("-q", "--quiet", action="store_true", help="print only the finding lines")
    args = parser.parse_args(argv)

    paths, missing = resolve(args.workflow)
    if missing:
        print("no such workflow: %s" % ", ".join(missing), file=sys.stderr)
        return 2
    if not paths:
        print("no workflow files found under %s" % os.path.relpath(WORKFLOWS, ROOT), file=sys.stderr)
        return 1

    findings = []
    for path in paths:
        findings.extend(scan_workflow(path))

    linted = None
    if not args.no_actionlint:
        linted = run_actionlint(paths)
        if linted:
            findings.extend(linted)

    if args.json:
        print(
            json.dumps(
                {
                    "workflows": [
                        path if os.path.relpath(path, ROOT).startswith("..") else os.path.relpath(path, ROOT)
                        for path in paths
                    ],
                    "actionlint": "not installed" if linted is None else len(linted),
                    "findings": findings,
                },
                indent=2,
            )
        )
    elif findings:
        print("ERROR: %d workflow finding(s):" % len(findings))
        for finding in findings:
            print("  " + finding)
        print("Quote the value (a `: ` inside one makes YAML read a second mapping), or fix what the line names.")
    elif not args.quiet:
        lint = "not installed" if linted is None else "clean"
        print(
            "OK: %d workflow file(s) parse - built-in scan clean, actionlint %s."
            % (len(paths), lint)
        )
        if linted is None:
            print(
                "    (`brew install actionlint` or `go install github.com/rhysd/actionlint/cmd/actionlint@latest`"
                " adds the full lint locally; the scan above is what CI runs.)",
                file=sys.stderr,
            )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
