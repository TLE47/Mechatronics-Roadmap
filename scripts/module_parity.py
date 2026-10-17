#!/usr/bin/env python3
"""
Tier-Parity Coverage for the Advanced Bridge Modules (`scripts/module_parity.py`)

The Tier 2/3 plan asks for one thing above all: to make the advanced bridge modules as good as the
Tier 1 ones, and to be able to say *how far* each one is. `scripts/lint_modules.py` proves structure
and reports the teaching-ladder gaps, but a heading is not a stage. This script turns the plan's
parity contract (`docs/QUALITY_SPEC.md`) into a number per module, per track and per tier, plus the
ratchet that stops any of them sliding back.

Four layers, weighted as the spec says:

    Structure 25%  front-matter contract, the numbered sections, the checkpoint tests, the
                   difficulty label (and, for Tier 3, the two levels a Tier 3 module must carry)
    Executable 30% the worked example runs and is diffed, the exercise is self-checked by its
                   answer key, a learner-facing scaffold exists, a `verification:` route is
                   declared for work that cannot run in a browser, and the module says which plant
                   it runs on (`plant: tier1_arm_motor` with a real `import mechalab_plant`, or
                   `plant: none` with a `plant_note:` reason)
    Ladder 30%     the eight named steps of the syllabus ladder, each measured by its own marker
    Validated 15%  the module has been done by the author and logged in `docs/dogfood-log.md`

Only the items that can be measured from the repository today are scored; everything the plan asks
for that has no artifact yet is listed under *Not yet instrumented* instead of being silently scored
zero. A scaffold that still carries the `TODO-AUTHOR` marker scores zero, so scaffolding can never be
mistaken for parity.

Two gates, deliberately separate:
  * the **ratchet** (`docs/parity-baseline.json`) - no track or module may drop below its recorded
    score. Update it on purpose with `--update-baseline` when a score rises. The baseline also
    records which **items were instrumented** when it was taken, because adding a measured item
    moves every score down: `--check` fails with `the scored item set changed` instead of letting a
    new requirement slide in as if the content had regressed. Re-record it deliberately, in a
    commit that says why.
  * the **level** (`tracks: <track>: lint_level:` in `modules/_index.yaml`) - `report` (default),
    `warn`, or `error`. A track flips to `error` once it reaches 100%, and then any missing item
    fails the build. That flip is the visible "this track is done" signal.

Usage:
    python3 scripts/module_parity.py                    # write docs/coverage-table.md + summary
    python3 scripts/module_parity.py --check             # CI: table in sync, ratchet held, error-tracks clean
    python3 scripts/module_parity.py --update-baseline   # record today's scores as the new floor
    python3 scripts/module_parity.py --json              # machine-readable scores

Exit-code family: typed (0 = every gate holds, 1 = findings, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

from lint_modules import (  # noqa: E402
    EXPECTED_SECTIONS,
    LADDER_MARKERS,
    NUMBERED_SECTION,
    module_files,
    parse_front_matter,
)

TABLE_PATH = os.path.join(ROOT, "docs", "coverage-table.md")
BASELINE_PATH = os.path.join(ROOT, "docs", "parity-baseline.json")
DOGFOOD_PATH = os.path.join(ROOT, "docs", "dogfood-log.md")
INDEX_PATH = os.path.join(ROOT, "modules", "_index.yaml")

SCAFFOLD_MARKER = "TODO-AUTHOR"
LINT_LEVELS = ("report", "warn", "error")
PLANT_DECISIONS = ("tier1_arm_motor", "none")
PLANT_IMPORT = "import mechalab_plant"
PLANT_NOTE_MIN_CHARS = 20
PLANT_LABELS = ("arm", "exempt", "unhooked", "undeclared")
# Python fences, so a declared import has to be *code the learner runs*, not a mention in prose.
PYTHON_BLOCK = re.compile(r"```python\n(.*?)```", re.DOTALL)
VERIFICATION_ROUTES = ("browser", "ci-native", "artifact", "rubric")
HARDWARE_RISKS = ("low", "medium", "high")
SIMULATION_LEVELS = ("full", "partial", "none")
PARITY_TOLERANCE = 0.0005

# Mirrors the `Expected output:` diff `scripts/validate_modules.py` executes in CI.
WORKED_EXAMPLE_BLOCK = re.compile(
    r"```python\n(.*?)```\s*Expected output:\s*```text\n(.*?)```", re.DOTALL
)


def section_bodies(text: str) -> dict[int, str]:
    """The text of each `## <n>. <title>` section, keyed by its number."""
    matches = list(NUMBERED_SECTION.finditer(text))
    bodies: dict[int, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        bodies[int(match.group(1))] = text[match.end() : end]
    return bodies


def front_matter_block(text: str) -> str:
    if not text.startswith("---\n"):
        return ""
    end = text.find("\n---\n", 4)
    return text[4:end] if end != -1 else ""


def difficulty_findings(front_matter: str) -> list[str]:
    """The plan's difficulty label: maths/coding/tools/hardware risk/simulatable.

    A trailing `# ...` comment on a value is ordinary YAML and the spec's own §2 example writes its
    block that way, so the value is what is matched - the comment is allowed to follow it. (It used
    to be rejected, which made the spec's own example fail: a course bug, fixed with the test in
    `tests/test_module_parity.py`.)
    """
    if not re.search(r"^difficulty:\s*(?:#.*)?$", front_matter, flags=re.MULTILINE):
        return ["no `difficulty:` block"]

    findings = []
    for field in ("math", "coding", "tools"):
        match = re.search(rf"^  {field}:\s*(\d+)\s*(?:#.*)?$", front_matter, flags=re.MULTILINE)
        if not match:
            findings.append(f"`difficulty.{field}:` is missing")
            continue
        value = int(match.group(1))
        low = 0 if field == "tools" else 1
        if not low <= value <= 5:
            findings.append(f"`difficulty.{field}: {value}` is outside {low}..5")
    for field, allowed in (
        ("hardware_risk", HARDWARE_RISKS),
        ("simulation", SIMULATION_LEVELS),
    ):
        match = re.search(rf"^  {field}:\s*(\S+)\s*(?:#.*)?$", front_matter, flags=re.MULTILINE)
        if not match:
            findings.append(f"`difficulty.{field}:` is missing")
        elif match.group(1) not in allowed:
            findings.append(f"`difficulty.{field}: {match.group(1)}` is not one of {list(allowed)}")
    return findings


def plant_decision(plant: str, note: str, text: str) -> tuple[bool, str]:
    """The plan's "uses the shared plant where relevant" item, with its published label.

    Two honest ways to satisfy it, and nothing else:
      * `plant: tier1_arm_motor` - and the module really imports the shared model, so the exercise
        runs on the same arm every other exercise does. A declaration with no import is not use.
      * `plant: none` with a `plant_note:` reason - a module about, say, a CAD file or a ROS 2 topic
        need not run on the arm, but it has to say so where a reviewer can read it.
    A bare mention in prose, `plant: none` with no reason, an unknown value and a missing key all
    score zero, which is what makes ignoring the plant visible in the published score.
    """
    if plant == "tier1_arm_motor":
        for block in PYTHON_BLOCK.findall(text):
            if PLANT_IMPORT in block:
                return (True, "arm")
        return (False, "unhooked")
    if plant == "none":
        if len(note) >= PLANT_NOTE_MIN_CHARS:
            return (True, "exempt")
        return (False, "unhooked")
    return (False, "undeclared")


def read_track_lint_levels() -> tuple[dict[str, str], list[str]]:
    """`tracks: <track>: lint_level:` from `modules/_index.yaml` (absent => every track reports)."""
    if not os.path.exists(INDEX_PATH):
        return {}, [f"{os.path.relpath(INDEX_PATH, ROOT)} not found"]
    levels: dict[str, str] = {}
    errors: list[str] = []
    in_tracks = False
    track: str | None = None
    with open(INDEX_PATH, "r", encoding="utf-8") as handle:
        for number, raw in enumerate(handle, start=1):
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line[0].isspace():
                in_tracks = line.startswith("tracks:")
                track = None
                continue
            if not in_tracks:
                continue
            track_match = re.match(r"^  ([^\s:]+):\s*$", line)
            if track_match:
                # Zero-padded track keys are quoted in the YAML (`"00":`), because a bare `00:`
                # is the integer 0 to any real parser.
                track = track_match.group(1).strip().strip('"').strip("'")
                continue
            level_match = re.match(r"^    lint_level:\s*(\S+)\s*$", line)
            if level_match:
                level = level_match.group(1)
                if level not in LINT_LEVELS:
                    errors.append(
                        f"modules/_index.yaml:{number}: `lint_level: {level}` must be one of "
                        f"{list(LINT_LEVELS)}"
                    )
                elif track:
                    levels[track] = level
    return levels, errors


def dogfooded_modules() -> set[str]:
    """Module ids that carry a row in `docs/dogfood-log.md` (layer 4)."""
    if not os.path.exists(DOGFOOD_PATH):
        return set()
    done: set[str] = set()
    with open(DOGFOOD_PATH, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.startswith("|"):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if not cells or not MODULE_ID_CELL.match(cells[0].strip("`")):
                continue
            done.add(cells[0].strip("`"))
    return done


MODULE_ID_CELL = re.compile(r"^\d{2}-[a-z-]+\.T\d\.\d+[a-z]?$")


def dogfood_rows() -> dict[str, list[str]]:
    """The dogfood table's cells by module id, so the evidence section can quote them."""
    rows: dict[str, list[str]] = {}
    if not os.path.exists(DOGFOOD_PATH):
        return rows
    with open(DOGFOOD_PATH, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.startswith("|"):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            # Only module-id rows: the log now also carries an evidence table whose first column is
            # a standard, and a prose table is not a dogfood row.
            if not cells or not MODULE_ID_CELL.match(cells[0].strip("`")):
                continue
            rows[cells[0].strip("`")] = cells
    return rows


def behaviourally_graded_modules() -> set[str]:
    """Module ids that ship an exercise package under `exercises/` (layer 4, item 2).

The package is only evidence because `scripts/run_exercise.py` proves it: the starter fails, the
reference solution passes behaviour *and* transfer tests, and every planted fault fails the test
that names it. A directory of markdown that calls itself an exercise is not this item.
"""
    root = os.path.join(ROOT, "exercises")
    graded: set[str] = set()
    if not os.path.isdir(root):
        return graded
    for name in os.listdir(root):
        manifest = os.path.join(root, name, "exercise.json")
        if os.path.isfile(manifest):
            graded.add(name)
    return graded


def browser_tested_modules() -> dict[str, str]:
    """Modules whose exercise entry a browser E2E script actually drives.

Claimed from the manifest, not from the `verification:` label: the script named under
`delivery.browser_e2e` must exist and mention the entry id, otherwise the column stays `-`. A
label saying "browser" is not a browser test.
"""
    root = os.path.join(ROOT, "exercises")
    tested: dict[str, str] = {}
    if not os.path.isdir(root):
        return tested
    for name in os.listdir(root):
        manifest_path = os.path.join(root, name, "exercise.json")
        if not os.path.isfile(manifest_path):
            continue
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        delivery = manifest.get("delivery", {})
        script = delivery.get("browser_e2e")
        if not script or not os.path.isfile(os.path.join(ROOT, script)):
            continue
        with open(os.path.join(ROOT, script), "r", encoding="utf-8") as handle:
            if delivery.get("workbench_id", "") in handle.read():
                tested[name] = os.path.basename(script)
    return tested


def score_module(path: str, dogfooded: set[str], behaviourally_graded: set[str]) -> dict[str, object]:
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()

    front_matter = front_matter_block(text)
    bodies = section_bodies(text)
    sections = [(int(m.group(1)), m.group(2)) for m in NUMBERED_SECTION.finditer(text)]
    tier_match = re.search(r"^tier:\s*(\d+)", front_matter, flags=re.MULTILINE)
    tier = int(tier_match.group(1)) if tier_match else 0
    module_id = os.path.splitext(os.path.basename(path))[0]
    track_match = re.search(r'^track:\s*"?([^"\n]+)"?', front_matter, flags=re.MULTILINE)
    track = (track_match.group(1).strip() if track_match else module_id.split("-")[0]).strip()

    worked_example = bodies.get(4, "")
    exercise = bodies.get(5, "")
    verification_match = re.search(
        r"^verification:\s*(\S+)", front_matter, flags=re.MULTILINE
    )
    verification = verification_match.group(1) if verification_match else ""
    plant_match = re.search(r"^plant:\s*(\S+)", front_matter, flags=re.MULTILINE)
    plant = plant_match.group(1).strip() if plant_match else ""
    plant_note_match = re.search(r"^plant_note:\s*(.+)$", front_matter, flags=re.MULTILINE)
    plant_note = (
        plant_note_match.group(1).strip().strip('"').strip("'") if plant_note_match else ""
    )
    plant_ok, plant_label = plant_decision(plant, plant_note, text)

    structure = {
        "front_matter_contract": not parse_front_matter(text),
        "numbered_sections": [title for _, title in sections]
        == list(EXPECTED_SECTIONS)
        and [number for number, _ in sections] == list(range(1, len(EXPECTED_SECTIONS) + 1)),
        "checkpoint_tests": bool(
            re.search(r"^###\s*Skip test", text, flags=re.MULTILINE)
            and re.search(r"^###\s*Gate test", text, flags=re.MULTILINE)
            and all(tag in text for tag in ("[Recall]", "[Apply]", "[Transfer]"))
        ),
        "difficulty_label": not difficulty_findings(front_matter),
    }
    if tier == 3:
        structure["tier3_two_levels"] = bool(
            re.search(r"^###\s*Use & Understand", text, flags=re.MULTILINE | re.IGNORECASE)
            and re.search(r"^###\s*Derive & Extend", text, flags=re.MULTILINE | re.IGNORECASE)
        )

    executable = {
        # The worked example is the module's runnable artefact: `scripts/validate_modules.py`
        # executes every such block and diffs its `Expected output:` in CI.
        "worked_example_runs": bool(WORKED_EXAMPLE_BLOCK.search(worked_example)),
        # The pencil-and-paper exercise is self-checked by its answer key (and the Gate test).
        "checkpoint_answer_key": bool(
            re.search(r"\*\*Answer key:\*\*", text) and re.search(r"\bassert\b", text)
        ),
        # The biggest Layer 2 gap today: no module ships a learner-facing starter scaffold, so no
        # module exercise can be attempted (or graded) the way a Tier 1 lesson exercise is.
        "learner_exercise_scaffold": bool(
            re.search(r"```python\n.*?\bTODO", exercise, flags=re.DOTALL)
            and "Full Solution" in exercise
        ),
        "verification_route_declared": verification in VERIFICATION_ROUTES,
        # The plan's Definition of Done: "uses the shared plant where relevant, with values matching
        # the plant file" - see resources/plants/README.md.
        "shared_plant": plant_ok,
    }

    ladder = {
        "1_recall": bool(re.search(LADDER_MARKERS["1 Recall"], text)),
        "2_see_it": bool(re.search(LADDER_MARKERS["2 See it"], text, flags=re.IGNORECASE | re.MULTILINE)),
        # The named stage, not the loose `\bpredict\b` marker: a checkable prediction is the
        # convention every rewritten track uses, and a bare mention is not a Predict step.
        "3_predict": bool(re.search(r"\*\*Predict first \(before you run it\):\*\*", text)),
        "4_worked_example": bool(
            re.search(LADDER_MARKERS["4 Work through"], text, flags=re.IGNORECASE | re.MULTILINE)
        ),
        "5_practice_host": bool(
            re.search(LADDER_MARKERS["5 Practice (host)"], text, flags=re.IGNORECASE | re.MULTILINE)
        ),
        "6_break_it": bool(
            re.search(r"^###\s*Break it on purpose", text, flags=re.MULTILINE)
            and all(marker in text for marker in ("**Inject", "**Symptom", "**Diagnose", "**Fix"))
        ),
        "7_transfer": "[Transfer]" in text,
        "8_integrate": bool(
            re.search(LADDER_MARKERS["8 Integrate"], text, flags=re.IGNORECASE | re.MULTILINE)
        ),
    }

    validated = {
        "dogfood_logged": module_id in dogfooded,
        "behavioural_grading": module_id in behaviourally_graded,
    }

    layers = {
        "structure": structure,
        "executable": executable,
        "ladder": ladder,
        "validated": validated,
    }
    scaffolded = SCAFFOLD_MARKER in text
    if scaffolded:
        # A scaffold is not a module: the marker makes that explicit and unmistakable.
        layers = {layer: {item: False for item in items} for layer, items in layers.items()}

    return {
        "module": module_id,
        "path": os.path.relpath(path, ROOT),
        "track": track,
        "tier": tier,
        "scaffolded": scaffolded,
        "verification": verification,
        "plant": plant_label,
        "plant_value": plant,
        "layers": layers,
        "score": parity_score(layers),
    }


def layer_fraction(layers: dict[str, dict[str, bool]], layer: str) -> float:
    items = layers[layer]
    return sum(1 for done in items.values() if done) / len(items) if items else 0.0


def parity_score(layers: dict[str, dict[str, bool]]) -> float:
    return round(
        0.25 * layer_fraction(layers, "structure")
        + 0.30 * layer_fraction(layers, "executable")
        + 0.30 * layer_fraction(layers, "ladder")
        + 0.15 * layer_fraction(layers, "validated"),
        4,
    )


def missing_items(row: dict[str, object]) -> list[str]:
    layers = row["layers"]  # type: ignore[assignment]
    return [
        f"{layer}:{item}"
        for layer, items in layers.items()  # type: ignore[union-attr]
        for item, done in items.items()
        if not done
    ]


def render_table(rows: list[dict[str, object]], levels: dict[str, str]) -> str:
    def plant_cell(row: dict[str, object]) -> str:
        label = str(row.get("plant", "undeclared"))
        value = str(row.get("plant_value", ""))
        if label == "arm":
            return "`arm`"
        if label == "exempt":
            return "`none` (reasoned)"
        if label == "unhooked":
            return "**declared, no import**" if value == "tier1_arm_motor" else "**none, no reason**"
        return "**undeclared**"

    tracks: dict[str, list[dict[str, object]]] = {}
    tiers: dict[int, list[dict[str, object]]] = {}
    for row in rows:
        tracks.setdefault(str(row["track"]), []).append(row)
        tiers.setdefault(int(row["tier"]), []).append(row)

    def mean(items: list[dict[str, object]]) -> float:
        return round(sum(float(item["score"]) for item in items) / len(items), 4) if items else 0.0

    lines = [
        "# Tier-Parity Coverage — Advanced Bridge Modules",
        "",
        "Generated by `scripts/module_parity.py` from `docs/QUALITY_SPEC.md` — do not edit by hand.",
        "Run `python3 scripts/module_parity.py` to refresh it, `--update-baseline` when a score is",
        "meant to rise (the ratchet refuses a drop), and `--check` in CI.",
        "",
        "Parity = **Structure 25% + Executable 30% + Ladder 30% + Validated 15%**, over the items this",
        "repository can measure today. A module carrying the `TODO-AUTHOR` scaffold marker scores 0.",
        "Everything the spec asks for that has no artifact yet is listed under *Not yet instrumented*",
        "rather than scored as zero.",
        "",
        "```mermaid",
        "flowchart LR",
        '    P["Parity score 0-100% per module"] --> T{"Track lint_level"}',
        '    T -->|report| Z["Published below; nothing fails"]',
        '    T -->|warn| Y["Missing items print a warning"]',
        '    T -->|error| X["Below 100% fails the build"]',
        '    P --> R["Ratchet: the score may only rise"]',
        "```",
        "",
        "## By track",
        "",
    ]
    header = (
        "| Track | Modules | Structure | Executable | Ladder | Validated | Parity | Shared plant | Level |"
    )
    lines += [
        header,
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |",
    ]
    for track in sorted(tracks, key=lambda value: (len(value), value)):
        group = tracks[track]
        layer_cells = " | ".join(
            f"{round(100 * sum(layer_fraction(row['layers'], layer) for row in group) / len(group))}%"  # type: ignore[arg-type]
            for layer in ("structure", "executable", "ladder", "validated")
        )
        counts = {label: sum(1 for row in group if str(row.get("plant")) == label) for label in PLANT_LABELS}
        lines.append(
            f"| `{track}` | {len(group)} | {layer_cells} | **{100 * mean(group):.1f}%** | "
            f"{counts['arm']} arm · {counts['exempt']} exempt · {counts['unhooked']} unhooked · "
            f"{counts['undeclared']} undeclared | "
            f"`{levels.get(track, 'report')}` |"
        )

    lines += ["", "## By tier", "", "| Tier | Modules | Parity |", "| :--- | :---: | :---: |"]
    for tier in sorted(tiers):
        lines.append(f"| Tier {tier} | {len(tiers[tier])} | **{100 * mean(tiers[tier]):.1f}%** |")

    plant_counts = {
        label: sum(1 for row in rows if str(row.get("plant")) == label) for label in PLANT_LABELS
    }

    lines += [
        "",
        f"## Per module ({len(rows)} modules, overall **{100 * mean(rows):.1f}%**)",
        "",
        "| Module | Tier | Structure | Executable | Ladder | Validated | Parity | Shared plant | Missing |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |",
    ]
    for row in sorted(rows, key=lambda item: str(item["module"])):
        cells = " | ".join(
            f"{round(100 * layer_fraction(row['layers'], layer))}%"  # type: ignore[arg-type]
            for layer in ("structure", "executable", "ladder", "validated")
        )
        missing = missing_items(row)
        lines.append(
            f"| `{row['module']}` | {row['tier']} | {cells} | **{100 * float(row['score']):.1f}%** | "
            f"{plant_cell(row)} | {len(missing)} item(s) |"
        )

    stage_totals = {stage: 0 for stage in next(iter(rows))["layers"]["ladder"]}  # type: ignore[index]
    for row in rows:
        for stage, done in row["layers"]["ladder"].items():  # type: ignore[union-attr]
            stage_totals[stage] += 1 if done else 0
    lines += [
        "",
        "## Ladder stages (named markers, all modules)",
        "",
        "| Stage | Modules carrying it | Gate |",
        "| :--- | :---: | :--- |",
    ]
    for stage in stage_totals:
        carried = stage_totals[stage]
        gate = "gated by `lint_modules.py`" if carried == len(rows) else "**gap**"
        lines.append(f"| `{stage}` | {carried}/{len(rows)} | {gate} |")

    on_the_arm = sorted(str(row["module"]) for row in rows if str(row.get("plant")) == "arm")
    lines += [
        "",
        "## Shared plant",
        "",
        "The plan's Definition of Done asks every module to use the shared plant *where relevant*, and",
        "that is now a **scored** item in the Executable layer rather than a promise: `plant:",
        "tier1_arm_motor` **and** an `import mechalab_plant` inside a python block (`arm`), or `plant:",
        "none` with a `plant_note:` reason (`none`, reasoned). A bare mention in prose, a declaration",
        "with no import, an unexplained exemption and a missing key all score zero - `unhooked` and",
        "`undeclared` below - so a module that ignores the arm is visible in its own score instead of",
        "being implied by silence.",
        "",
        f"- On the shared arm: **{plant_counts['arm']}/{len(rows)}**"
        + (f" - {', '.join('`' + module + '`' for module in on_the_arm)}" if on_the_arm else ""),
        f"- Declared exempt, with a reason: **{plant_counts['exempt']}/{len(rows)}**",
        f"- Declared but not hooked up (`plant: tier1_arm_motor` with no `import mechalab_plant` in a",
        f"  python block, or `plant: none` with no reason): **{plant_counts['unhooked']}/{len(rows)}**",
        f"- Undeclared: **{plant_counts['undeclared']}/{len(rows)}**",
        "",
        "The plant itself, its provenance rule and the workbench import contract:",
        "[`resources/plants/README.md`](../resources/plants/README.md).",
        "",
        "## Validation evidence",
        "",
        "A percentage cannot say *what kind* of evidence stands behind it, so this table does. The",
        "columns are deliberately separate: a module can be content-complete and author-tested while",
        "its transfer retention is still unmeasured, and collapsing those into one *validated* flag is",
        "what this section exists to stop. **100% means 100% of the requirements instrumented today,**",
        "not demonstrated learner mastery.",
        "",
        "| Module | Parity | Reference solution tested | Behaviour-graded | Browser E2E | Author dogfood | Delayed transfer | Independent learner |",
        "| :--- | :---: | :---: | :---: | :---: | :--- | :---: | :---: |",
    ]
    log_rows = dogfood_rows()
    graded_ids = behaviourally_graded_modules()
    browser_ids = browser_tested_modules()
    for row in sorted(rows, key=lambda item: str(item["module"])):
        module = str(row["module"])
        layers = row["layers"]  # type: ignore[assignment]
        validated = layers["validated"]  # type: ignore[index]
        dogfood = log_rows.get(module)
        lines.append(
            "| `%s` | **%.1f%%** | %s | %s | %s | %s | %s | %s |"
            % (
                module,
                100 * float(row["score"]),
                "yes" if module in graded_ids else "`-`",
                "yes" if validated.get("behavioural_grading") else "`-`",
                ("yes (`%s`)" % browser_ids[module]) if module in browser_ids else "`-`",
                ("%s, %s min, %s hints" % (dogfood[1], dogfood[2], dogfood[3])) if dogfood else "`-`",
                dogfood[6] if dogfood and len(dogfood) > 6 else "`-`",
                "`-`",
            )
        )
    lines += [
        "",
        "**Behaviour-graded** means `exercises/<module>/exercise.json` exists *and*",
        "`scripts/run_exercise.py` passes: the starter fails on its own `NotImplementedError`, the",
        "reference solution passes the behaviour and transfer suites, and every planted fault fails the",
        "test that names it. The tests the harness runs are the same ones CI runs.",
        "",
        "## Not yet instrumented",
        "",
        "The plan asks for these too. No artifact exists for them yet, so they are listed rather than",
        "scored - each one is a piece of work, not a zero:",
        "",
        "- **Behavioural tests for the other 43 modules:** one exercise package exists",
        "  (`02-mechanics.T2.02a`), and it is the template. `INSTRUCTOR_TESTS` in",
        "  `scripts/generate_python_lessons_data.py` covers the beginner lessons only, so the",
        "  remaining bridge modules ship no graded exercise of their own yet.",
        "- **Module exercises in the workbench:** the reference exercise is generated into the app as",
        "  a self-checking entry and `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, but",
        "  it is still the only module with a browser entry, so the E2E suite covers one T2 exercise.",
        "- **Maths-claims audit:** absolute claims (`guaranteed`, `always`, `never`, `positive definite`)",
        "  with their stated assumptions, and a counterexample test where a claim is easy to get wrong.",
        "- **Transfer-task retention:** whether the Transfer task still passes 1-2 weeks later, and",
        "  arrival times from a real beginner pilot (`docs/dogfood-log.md` records author-dogfood only).",
        "",
    ]
    return "\n".join(lines)


def build() -> tuple[int, list[dict[str, object]], dict[str, str], list[str]]:
    files = module_files()
    if not files:
        return 2, [], {}, ["no modules/*.md found"]
    dogfooded = dogfooded_modules()
    graded = behaviourally_graded_modules()
    rows = [score_module(path, dogfooded, graded) for path in files]
    levels, index_errors = read_track_lint_levels()
    return 0, rows, levels, index_errors


def instrumented_items(rows: list[dict[str, object]]) -> list[str]:
    """Every scored item id, unioned across modules (Tier 3 carries one extra structure item).

    The baseline records this list. Adding a measured item lowers every score without any content
    changing, which is a different event from a regression - so `--check` refuses to compare a score
    whose item set has moved until someone re-records the floor and says why.
    """
    items: set[str] = set()
    for row in rows:
        for layer, layer_items in row["layers"].items():  # type: ignore[union-attr]
            items.update(f"{layer}:{item}" for item in layer_items)
    return sorted(items)


def plant_label_counts(rows: list[dict[str, object]]) -> dict[str, int]:
    return {label: sum(1 for row in rows if str(row.get("plant")) == label) for label in PLANT_LABELS}


def track_scores(rows: list[dict[str, object]]) -> dict[str, float]:
    tracks: dict[str, list[float]] = {}
    for row in rows:
        tracks.setdefault(str(row["track"]), []).append(float(row["score"]))
    return {track: round(sum(values) / len(values), 4) for track, values in sorted(tracks.items())}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Score every bridge module against the Tier-parity contract and hold the ratchet."
    )
    parser.add_argument("--check", action="store_true", help="verify the table, the ratchet and every `error` track")
    parser.add_argument("--update-baseline", action="store_true", help="record today's scores as the new floor")
    parser.add_argument("--json", action="store_true", help="emit scores as JSON")
    parser.add_argument("--quiet", action="store_true", help="print the summary line only")
    args = parser.parse_args()

    if args.check and args.update_baseline:
        print("usage: --check and --update-baseline are mutually exclusive", file=sys.stderr)
        return 2

    status, rows, levels, index_errors = build()
    if status != 0:
        for error in index_errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return status

    overall = round(sum(float(row["score"]) for row in rows) / len(rows), 4)
    tracks = track_scores(rows)
    tiers = {
        str(tier): round(
            sum(float(row["score"]) for row in rows if int(row["tier"]) == tier)
            / max(1, sum(1 for row in rows if int(row["tier"]) == tier)),
            4,
        )
        for tier in sorted({int(row["tier"]) for row in rows})
    }
    table = render_table(rows, levels)

    if args.json:
        print(
            json.dumps(
                {
                    "overall": overall,
                    "tiers": tiers,
                    "tracks": tracks,
                    "lint_levels": levels,
                    "instrumented_items": instrumented_items(rows),
                    "plant": {
                        label: sorted(str(row["module"]) for row in rows if str(row.get("plant")) == label)
                        for label in PLANT_LABELS
                    },
                    "modules": [
                        {
                            "module": row["module"],
                            "track": row["track"],
                            "tier": row["tier"],
                            "score": row["score"],
                            "plant": row["plant"],
                            "plant_value": row["plant_value"],
                            "missing": missing_items(row),
                        }
                        for row in rows
                    ],
                },
                indent=2,
            )
        )
        return 0

    findings: list[str] = list(index_errors)

    if args.update_baseline:
        baseline = {
            "schema": 2,
            "note": (
                "Ratchet for scripts/module_parity.py: --check fails if any track or module drops below "
                "the value recorded here. Raise it deliberately with --update-baseline. `recorded_note` "
                "says why the last re-record happened; `instrumented_items` is the set of scored items "
                "at that moment, so adding a new item is a deliberate re-record, never a silent drop."
            ),
            "recorded_note": (
                "Re-recorded when 00-foundations.T2.00b gained the third exercise package: its "
                "validated layer now earns `behavioural_grading`, so its score rises and no other "
                "module moves. The floor is raised so that point cannot be given back; the previous "
                "re-record was 00-foundations.T2.00a gaining the second package, and before that the "
                "reference module (02-mechanics.T2.02a) reaching a genuine 100% on the shared plant."
            ),
            "instrumented_items": instrumented_items(rows),
            "overall": overall,
            "tiers": tiers,
            "tracks": tracks,
            "modules": {str(row["module"]): float(row["score"]) for row in sorted(rows, key=lambda item: str(item["module"]))},
        }
        with open(BASELINE_PATH, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(baseline, indent=2) + "\n")
        print(f"Baseline recorded: {os.path.relpath(BASELINE_PATH, ROOT)} (overall {100 * overall:.1f}%)")

    if not args.check:
        with open(TABLE_PATH, "w", encoding="utf-8") as handle:
            handle.write(table + "\n")
    else:
        existing = ""
        if os.path.exists(TABLE_PATH):
            with open(TABLE_PATH, "r", encoding="utf-8") as handle:
                existing = handle.read()
        if existing != table + "\n":
            findings.append(
                f"{os.path.relpath(TABLE_PATH, ROOT)} is out of date - run `python3 scripts/module_parity.py`"
            )

    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH, "r", encoding="utf-8") as handle:
            baseline = json.load(handle)
        recorded_items = list(baseline.get("instrumented_items") or [])
        current_items = instrumented_items(rows)
        if recorded_items != current_items:
            added = [item for item in current_items if item not in recorded_items]
            removed = [item for item in recorded_items if item not in current_items]
            findings.append(
                "the scored item set changed (added: %s; removed: %s) - an instrumented requirement "
                "moves every score down, so re-record the floor with `--update-baseline` in a commit "
                "that says the drop is a measurement change, not content regression"
                % (", ".join(added) or "-", ", ".join(removed) or "-")
            )
        if round(float(baseline.get("overall", 0)) - overall, 4) > PARITY_TOLERANCE:
            findings.append(
                f"overall parity dropped {100 * (float(baseline['overall']) - overall):.1f} points "
                f"({100 * float(baseline['overall']):.1f}% -> {100 * overall:.1f}%)"
            )
        for track, value in sorted(baseline.get("tracks", {}).items()):
            current = tracks.get(track)
            if current is None:
                findings.append(f"track `{track}` is in the baseline but no longer has modules")
            elif round(float(value) - current, 4) > PARITY_TOLERANCE:
                findings.append(
                    f"track `{track}` parity dropped {100 * (float(value) - current):.1f} points "
                    f"({100 * float(value):.1f}% -> {100 * current:.1f}%)"
                )
        for module, value in sorted(baseline.get("modules", {}).items()):
            row = next((item for item in rows if item["module"] == module), None)
            if row is None:
                findings.append(f"module `{module}` is in the baseline but no longer exists")
            elif round(float(value) - float(row["score"]), 4) > PARITY_TOLERANCE:
                findings.append(
                    f"module `{module}` parity dropped {100 * (float(value) - float(row['score'])):.1f} points"
                )
    elif args.check:
        findings.append(
            f"{os.path.relpath(BASELINE_PATH, ROOT)} is missing - create it once with `--update-baseline`"
        )

    for track in sorted(tracks):
        level = levels.get(track, "report")
        if level == "report":
            continue
        unfinished = [
            str(row["module"]) for row in rows if str(row["track"]) == track and float(row["score"]) < 1.0
        ]
        if level == "error" and unfinished:
            findings.append(
                f"track `{track}` is at `lint_level: error` but {len(unfinished)} module(s) are below 100%: "
                f"{', '.join(unfinished[:5])}"
            )
        elif level == "warn" and unfinished:
            print(
                f"warning: track `{track}` (lint_level: warn) has {len(unfinished)} module(s) below 100%",
                file=sys.stderr,
            )

    if findings:
        print(f"FAIL: {len(findings)} parity finding(s):", file=sys.stderr)
        for finding in findings:
            print(f"  - {finding}", file=sys.stderr)
        return 1

    if args.check:
        print(
            f"OK: parity table in sync, ratchet held, no `error` track below 100% "
            f"(overall {100 * overall:.1f}% across {len(rows)} modules; "
            f"shared plant: {plant_label_counts(rows)['arm']} arm, "
            f"{plant_label_counts(rows)['exempt']} exempt, "
            f"{plant_label_counts(rows)['unhooked']} unhooked, "
            f"{plant_label_counts(rows)['undeclared']} undeclared)"
        )
    elif args.quiet:
        print(f"parity {100 * overall:.1f}% across {len(rows)} modules")
    else:
        print(table)
        print(
            f"[PASS] parity overall {100 * overall:.1f}% over {len(rows)} modules; "
            f"tiers {', '.join(f'{tier}:{100 * value:.1f}%' for tier, value in tiers.items())}; "
            f"wrote {os.path.relpath(TABLE_PATH, ROOT)}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
