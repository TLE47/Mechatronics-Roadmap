#!/usr/bin/env python3
"""Cost and index the course by the ten-step spine, on the pages a learner opens.

The route has one order: `scripts/route_model.py`'s ten steps. The pages that cost it did not.
`docs/SYLLABUS.md` scheduled three passes and eight legacy `T*.0x` steps, so it quoted 326.5
hours while the ten steps summed to 200.35-290 from the same metadata; each track README opened
on a pass table that sent the reader to a *second* order ("Track 01 in the same Tier"); and
`docs/CURRICULUM.md` mapped steps to folders without ever saying what a step costs.

This generator makes the spine, its depth layers and its hours one artifact each, all summed
from the pages themselves (a module's `est_hours`, a lesson's `typical_hours` and
`slow_learner_hours`) - it never invents or types a subtotal:

* `docs/SYLLABUS.md` - the ten steps costed page by page, with the arm layer, the Depth 2 pass
  (Tier 2 practice) and the Depth 3 pass (Tier 3 derivation) separate, so "how long is this step",
  "what does the practice half add" and "what does the derivation half add" are three answers.
* `docs/CURRICULUM.md` - the step <-> folder <-> id map and each track's depth layers, with
  the hours of each.
* the nine track READMEs (Tracks 00-08) - a step block between `<!-- step-index -->` markers:
  which step the folder is, what this track costs at each depth, and the next step. The teaching
  prose below it is untouched, and the `Tier 1/2/3` headings keep their names because two hundred
  module pages link to those anchors - the block says to read "Tier 1" as Depth 1 of its step,
  "Tier 2" as Depth 2 and "Tier 3" as Depth 3, with the optional pages outside both routes.

The block replaced the old per-pass navigation table once; the markers make it idempotent, so a
later page move rewrites the block instead of stacking a second one, and a README with neither the
markers nor the old table is an error rather than a silent skip.

Usage:
    python3 scripts/generate_step_docs.py            # rewrite the syllabus, map and nine READMEs
    python3 scripts/generate_step_docs.py --check    # exit 1 if any of them is stale
"""

import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_sim_route as route  # noqa: E402
import route_model  # noqa: E402

SYLLABUS = os.path.join(ROOT, "docs", "SYLLABUS.md")
CURRICULUM = os.path.join(ROOT, "docs", "CURRICULUM.md")
OPEN = "<!-- step-index -->"
CLOSE = "<!-- /step-index -->"
LEGACY_HEADING = "## \U0001f504 Linear Level-Up Navigation"
OLD_COURSE_NAME = "MechaLab Multi-Pass Tiered Roadmap"
NEW_COURSE_NAME = "ten-step MechaLab course"

# The nine track folders, Tracks 00-08. Track 08 is Step 10's folder and has no depth layer, but
# it is still a track page a learner lands on, so it gets the same step block and cost line.
TRACKS = [
    "00-foundations",
    "01-electronics-and-power",
    "02-mechanics-kinematics-dynamics",
    "03-sensors-and-actuators",
    "04-embedded-and-realtime",
    "05-control-and-estimation",
    "06-robotics-and-autonomy",
    "07-systems-hil-and-production",
    "08-capstone-projects",
]

# Which page a fast-track entry may skip, and the gate that proves it may. The savings column is
# summed from those pages' own hours, so an entry point cannot claim more than the pages hold.
ENTRY_PATHS = [
    (
        "Software / CS engineer",
        "Python, Git, C pointers and a Linux shell",
        [
            "00-foundations.T1.00a",
            "00-foundations.T1.00b",
            "04-embedded.T1.04a",
        ],
    ),
    (
        "Mechanical engineer",
        "SI units, vectors, free-body diagrams, $SE(3)$ and ODEs",
        [
            "00-foundations.T1.00c",
            "00-foundations.T1.00d",
            "00-foundations.T1.00e",
            "02-mechanics.T1.02a",
            "00-foundations.T2.00b",
            "00-foundations.T2.00c",
            "02-mechanics.T2.02a",
        ],
    ),
    (
        "Electrical / embedded engineer",
        "Ohm's law, RC/RL, MOSFET PWM, op-amps, SPI/DMA and an RTOS",
        [
            "01-electronics.T1.01a",
            "01-electronics.T1.01b",
            "01-electronics.T1.01c",
            "01-electronics.T1.01d",
            "04-embedded.T1.04a",
            "04-embedded.T1.04b",
            "01-electronics.T2.01a",
            "01-electronics.T2.01b",
            "04-embedded.T2.04a",
            "04-embedded.T2.04b",
        ],
    ),
]

# The bridging sentence per track: what changes when the maker version becomes the production one.
# Prose, not a number, so it stays here rather than being derived; the hours beside it do not.
# The section anchors each track keeps. The track pages name their three sections `Tier 1/2/3`;
# Track 08 names them `Tier 1/2/3 Capstone Builds`, so its anchors are the longer ones.
DEFAULT_ANCHORS = (
    "tier-1-beginner--intuitive",
    "tier-2-intermediate--applied",
    "tier-3-advanced--production",
)
CAPSTONE_ANCHORS = (
    "tier-1-capstone-builds-beginner--breakout-pass",
    "tier-2-capstone-builds-intermediate--applied-pass",
    "tier-3-capstone-builds-advanced--production-pass",
)
ANCHORS = {"08-capstone-projects": CAPSTONE_ANCHORS}

# One sentence a track needs beyond the shared block. Foundations is the one page a learner is
# tempted to read end to end before touching hardware; the ten steps say not to.
EXTRAS = {
    "00-foundations": (
        "Do not read this folder end to end first: Depth 1 is Step 3's arm module plus lessons "
        "`00.1`-`00.3`, and you then move on to Track 01 in the same step. Depth 2 is the return "
        "visit after Step 10, when the arm exists to model."
    ),
}

BRIDGES = {
    "00-foundations": "Moving average to pre-warped TDF-II biquad notch",
    "01-electronics-and-power": "`DRV8833`/`INA219` breakouts to `DRV8353` + `INA240` Kelvin PCB",
    "02-mechanics-kinematics-dynamics": "200:1 hobby servos to 8:1 backdrivable QDD actuator",
    "03-sensors-and-actuators": "Hobby ESC / voltage mode to centre-aligned ADC current FOC",
    "04-embedded-and-realtime": "Global structs / `mutex` to DMA ping-pong pipelines",
    "05-control-and-estimation": "Trial-and-error PID to LQR + predictive safety filter",
    "06-robotics-and-autonomy": "Rigid `servo.write()` stepping to 1 kHz torque/impedance control",
    "07-systems-hil-and-production": "Software `if(fault) pwm=0` to dual-channel hardware STO",
    "08-capstone-projects": "One arm, three depths: breakout build, custom CAN servo, production capstone",
}


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def rng(low, high):
    """`3` for a single value, `3-3.5` for a range, `-` when the page carries no hours."""
    if low is None or high is None:
        return "-"
    if abs(low - high) < 1e-9:
        return f"{low:g}"
    return f"{low:g}-{high:g}"


def totals(rows):
    """Sum a list of page rows; `(None, None)` when there is nothing to sum."""
    rows = [row for row in rows if row.get("low") is not None]
    if not rows:
        return (None, None)
    return (round(sum(row["low"] for row in rows), 2), round(sum(row["high"] for row in rows), 2))


def depth_by_tier(rows):
    """`((tier2_rows, tier2_hours), (tier3_rows, tier3_hours))`, from each module's own tier.

    Depth 2 is the Tier 2 practice pass and Depth 3 the Tier 3 derivation pass. A page that is
    optional is not a depth at all: it sits outside both routes, so callers list it separately.
    """
    tier2 = [row for row in rows if route_model.depth_tier(row) == 2]
    tier3 = [row for row in rows if route_model.depth_tier(row) == 3]
    return (tier2, totals(tier2)), (tier3, totals(tier3))


def step_lessons_in(step, number):
    prefix = f"{number:02d}-"
    return [row for row in step["lessons"] if row["path"].startswith(prefix)]


def step_modules_in(step, number):
    prefix = f"{number:02d}-"
    return [row for row in step["modules"] if row["id"].startswith(prefix)]


def outside_modules_in(index, number):
    """Pages in this track that no route requires: graded, badgeable, outside both passes.

    That is every module page in the folder the step does not list - whether the step calls it
    `optional` or never names it. Reading only the step's `optional` list hid Track 01's Tier 3
    page, which the step neither requires nor marks optional, so the track page linked to it in
    its Tier 3 prose while the cost table called the column empty.
    """
    required = set(route_model.STEPS[index]["modules"])
    prefix = f"{number:02d}-"
    return [
        row for row in route.module_rows()
        if row["id"].startswith(prefix) and row["id"] not in required
    ]


def step_of_track():
    """`{track number: step index}` from the model, refusing a track it cannot place once."""
    owner = {}
    for index, step in enumerate(route_model.facts()["steps"]):
        for number in range(0, len(TRACKS)):
            if step_lessons_in(step, number) or step_modules_in(step, number):
                if number in owner and owner[number] != index:
                    raise SystemExit(
                        f"Track {number:02d} appears in both Step {owner[number] + 1} and "
                        f"Step {index + 1}; a track is one step's folder"
                    )
                owner[number] = index
    missing = sorted(set(range(0, len(TRACKS))) - set(owner))
    if missing:
        raise SystemExit(
            "no step owns " + ", ".join(f"Track {number:02d}" for number in missing)
            + "; add its pages to a step in scripts/route_model.py"
        )
    return owner


def track_title(folder):
    """The README's own title, minus its `# ` prefix: `Track 01: Mixed-Signal ...`."""
    for line in read(os.path.join(ROOT, folder, "README.md")).splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise SystemExit(f"{folder}/README.md has no title line")


def step_folders(step):
    """The folder(s) a step's pages live in - `track-p`, `stage-0`, a track, or Step 9's two."""
    folders = []
    for row in step["lessons"]:
        head = row["path"].split("/", 1)[0]
        if head not in folders:
            folders.append(head)
    for row in step["modules"]:
        folder = next((f for f in TRACKS if row["id"].startswith(f[:2] + "-")), None)
        if folder is None:
            folder = "08-capstone-projects"
        if folder not in folders:
            folders.append(folder)
    return folders


def folder_label(folder):
    """`Track 04` from the README's own title, so a renamed track renames its link."""
    return track_title(folder).split(":")[0].strip()


def folder_links(step, prefix=""):
    return " + ".join(
        f"[{folder_label(folder)}]({prefix}{folder}/README.md)" for folder in step_folders(step)
    )


def plural(count, word):
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def span(rows):
    """The ids a step holds, first-last plus a count, instead of a forty-cell table."""
    if not rows:
        return "—"
    ids = [row["id"] for row in rows]
    if len(ids) == 1:
        return f"`{ids[0]}`"
    return f"`{ids[0]}`-`{ids[-1]}` ({len(ids)})"


def lesson_link(row, prefix):
    return f"[`{row['id']}`]({prefix}{row['path']})"


def module_link(row, prefix="../modules/"):
    return f"[`{row['id']}`]({prefix}{row['id']}.md)"


def step_by_number(number):
    return route_model.facts()["steps"][number - 1]


# --------------------------------------------------------------------------------------------
# docs/SYLLABUS.md
# --------------------------------------------------------------------------------------------


def render_syllabus():
    facts = route_model.facts()
    steps = facts["steps"]
    core = route.route_facts()
    depth = route.depth_facts()
    full = route.full_route_facts()
    minimum = route.minimum_facts()
    modules = route_model.all_modules()
    outside = [
        row for row in route.module_rows() if row["id"] not in set(route.CORE_MODULES)
    ]
    outside_low, outside_high = totals(outside)

    lines = [
        "# The ten-step syllabus: what each step costs",
        "",
        "> **Audience:** anyone planning the course, and maintainers who need the numbers to be",
        "> true. There is one order - **Steps 1-10** - and one cost column, **focused hours**,",
        "> summed from each page's own front matter by `scripts/generate_step_docs.py`. To change a",
        "> number, change the page's metadata and re-run the generator; a hand-typed subtotal is",
        "> what let this page quote 326.5 h for a 200-290 h route.",
        "",
        "## A. How to read the cost",
        "",
        "- **Focused hours** are time with the page open: the reading, the worked example, the",
        "  exercise and its checks. They exclude setup, debugging and re-reading, which is why the",
        "  front page's calendar estimate multiplies this column by 5-10. An hour target is not",
        "  elapsed time.",
        "- **Three layers, one order.** The **arm layer** is every Tier 1 bridge plus the Step 10",
        "  capstone: take it in Steps 1-10 and you have a working, verified 2-DOF arm. The **Depth 2",
        "  pass** is the Tier 2 practice modules; the **Depth 3 pass** is the Tier 3 modules that",
        "  derive and validate. Both are a second pass in the same step order, after Step 10, and",
        "  nothing on the arm consumes them.",
        f"- **Pages outside both routes.** A further {len(outside)} modules are graded and "
        "badgeable but not required; they are neither depth, and are listed at the end of this page "
        "and in each track README as the optional pages.",
        "- **Every row is a page.** The lesson rows are the prose lessons, the module rows are the",
        "  graded `modules/*.md` packages, and no page appears in two steps.",
        "",
        "## B. The ten steps, costed",
        "",
        "```mermaid",
        "flowchart LR",
        f'    Arm["Arm layer<br/>Steps 1-10 · {rng(facts["arm_low"], facts["arm_high"])} h"] '
        '--> Built["A verified 2-DOF arm"]',
        f'    Built --> Depth["Depth layer<br/>Steps 3-10 again · {rng(facts["depth_low"], facts["depth_high"])} h"]',
        f'    Depth --> Full["Full course<br/>{rng(facts["low"], facts["high"])} h"]',
        f'    Outside["Outside both routes<br/>{len(outside)} modules"] -.-> Full',
        "```",
        "",
        "| Step | Lessons | Arm layer | Depth 2 · practice | Depth 3 · derive | Focused hours |",
        "| :--- | ---: | :--- | :--- | :--- | ---: |",
    ]

    def layer_cell(rows, low, high):
        if not rows:
            return "—"
        return f"{plural(len(rows), 'module')} · {rng(low, high)} h"

    for step in steps:
        arm = "—" if not step["arm_module_count"] else (
            f"{plural(step['arm_module_count'], 'module')} · "
            f"{rng(step['arm_low'], step['arm_high'])} h"
        )
        lines.append(
            f"| **{step['number']} · {step['title']}** ({folder_links(step, '../')}) | "
            f"{step['lesson_count']} | {arm} | "
            f"{layer_cell(step['depth2_modules'], step['depth2_low'], step['depth2_high'])} | "
            f"{layer_cell(step['depth3_modules'], step['depth3_low'], step['depth3_high'])} | "
            f"**{rng(step['low'], step['high'])}** |"
        )
    lines += [
        f"| **Arm route, Steps 1-10** | {facts['lesson_count']} | "
        f"{plural(facts['arm_module_count'], 'module')} · "
        f"{rng(facts['arm_low'], facts['arm_high'])} h | — | — | "
        f"**{rng(facts['arm_low'], facts['arm_high'])}** |",
        f"| **Depth 2 pass, after Step 10** | — | — | "
        f"{plural(facts['depth2_module_count'], 'module')} · "
        f"{rng(facts['depth2_low'], facts['depth2_high'])} h | — | "
        f"**{rng(facts['depth2_low'], facts['depth2_high'])}** |",
        f"| **Depth 3 pass, after Step 10** | — | — | — | "
        f"{plural(facts['depth3_module_count'], 'module')} · "
        f"{rng(facts['depth3_low'], facts['depth3_high'])} h | "
        f"**{rng(facts['depth3_low'], facts['depth3_high'])}** |",
        f"| **Depth pass, after Step 10** | — | — | "
        f"{plural(facts['depth2_module_count'], 'module')} | "
        f"{plural(facts['depth3_module_count'], 'module')} | "
        f"**{rng(facts['depth_low'], facts['depth_high'])}** |",
        f"| **Full course** | {facts['lesson_count']} | "
        f"{plural(facts['arm_module_count'], 'module')} | "
        f"{plural(facts['depth2_module_count'], 'module')} | "
        f"{plural(facts['depth3_module_count'], 'module')} | "
        f"**{rng(facts['low'], facts['high'])}** |",
        "",
        f"The arm route is **{rng(core['low'], core['high'])} focused hours**, the depth pass adds "
        f"**{rng(depth['low'], depth['high'])}** - of which Depth 2 practice is "
        f"**{rng(facts['depth2_low'], facts['depth2_high'])}** and Depth 3 derivation is "
        f"**{rng(facts['depth3_low'], facts['depth3_high'])}** - and the full course is "
        f"**{rng(full['low'], full['high'])}**. The minimum viable finish - every Tier 1 bridge plus "
        f"the capstone and the {len(route.MINIMUM_LESSON_IDS) - 1} lessons it opens - is "
        f"**{rng(minimum['low'], minimum['high'])} focused hours**; its page list is "
        f"[`MINIMUM.md`](MINIMUM.md).",
        "",
        "## C. The teaching sequence every page follows",
        "",
        "Every lesson and every module runs the same eight moves, so a learner proves prediction,",
        "fault diagnosis and transfer rather than copying a worked example:",
        "",
        "1. **Recall** - a quick check of the prerequisite concepts from the dependency graph.",
        "2. **See it** - a diagram, waveform or interactive workbench animation.",
        "3. **Predict** - commit to a quantitative or directional prediction before running anything.",
        "4. **Work through** - one complete worked example with intermediate units and values.",
        "5. **Practice with support** - starter code with `TODO`s, or a guided simulation with a",
        "   three-step hint ladder.",
        "6. **Break it on purpose** - inject a parameter error or a common fault and diagnose it.",
        "7. **Transfer** - a modified-parameter or unseen-boundary scenario, checked by behavioral",
        "   tests.",
        "8. **Integrate** - apply the skill to the recurring 2-DOF arm in this or the next step.",
        "",
        "Each page also surfaces five difficulty dimensions: **Math level**, **coding level**, **new",
        "tools**, **hardware risk** (`None/Sim`, `Low-Voltage <=12V`, `High-Energy Review",
        "Required`) and **simulation-capable status**. Beginner lessons add at most two new ideas;",
        "bridge modules at most three.",
        "",
        "The depth layer's Tier 3 pages split into two levels, and both are graded:",
        "",
        "- **Level A - Use & Understand:** what the method (`SO(3)`, FOC, ESKF, MPC, CBF-QP) does,",
        "  when to reach for it, how to run it in the workbench, and how to check it is physically",
        "  sane (units, energy, covariance bounds).",
        "- **Level B - Derive & Extend:** the Lie-algebra, Riccati or QP derivation, the fixed-point",
        "  and concurrency implementation, and the worst-case timing and thermal bounds.",
        "",
        "## D. Every step, page by page",
        "",
    ]

    for step in steps:
        low, high = step["low"], step["high"]
        (tier2_rows, _), (tier3_rows, _) = depth_by_tier(step["depth_modules"])
        lines += [
            f"### Step {step['number']} · {step['title']}",
            "",
            f"> {step['outcome']}",
            "",
            f"Starts at {lesson_link({'id': step['lessons'][0]['id'], 'path': step['start']}, '../')}"
            f" · **{rng(low, high)} focused hours** · {plural(step['lesson_count'], 'lesson')}"
            + (
                f" · {plural(step['arm_module_count'], 'arm module')}"
                if step["arm_module_count"] else ""
            )
            + (
                f" · {plural(len(tier2_rows), 'Depth 2 module')}" if tier2_rows else ""
            )
            + (
                f" · {plural(len(tier3_rows), 'Depth 3 module')}" if tier3_rows else ""
            )
            + ".",
            "",
            "| Page | What it teaches | Layer | Focused hours |",
            "| :--- | :--- | :--- | ---: |",
        ]
        for row in step["lessons"]:
            lines.append(
                f"| {lesson_link(row, '../')} | {row['title']} | lesson | {rng(row['low'], row['high'])} |"
            )
        for row in step["arm_modules"]:
            lines.append(
                f"| {module_link(row)} | {row['title']} | arm | {rng(row['low'], row['high'])} |"
            )
        for label, rows in (("depth 2", tier2_rows), ("depth 3", tier3_rows)):
            for row in rows:
                lines.append(
                    f"| {module_link(row)} | {row['title']} | {label} | "
                    f"{rng(row['low'], row['high'])} |"
                )
        lines.append("")
        if step["optional"]:
            names = ", ".join(module_link(row) for row in step["optional"])
            lines += [
                f"Optional pages in this step's folder - graded, not required: {names}.",
                "",
            ]

    lines += [
        "## E. Three finish lines, and the help each needs",
        "",
        "| Route | What \"complete\" means | Expected help and safety boundary |",
        "| :--- | :--- | :--- |",
        "| **1. Learn & simulate (\\$0)** | Every lesson, exercise, simulator lab, planted-fault "
        "diagnostic and capstone, in the browser or with the supplied tools (`Pyodide`, Falstad, "
        "Wokwi, MuJoCo, ROS 2). | Built-in hints, maths refreshers and tool first-run labs are "
        "designed to be enough for self-study. |",
        "| **2. Build (optional low-voltage bench)** | Assemble and test the optional `<=12 V` "
        "hardware (`Arduino Uno`, `DRV8833`/`TB6612FNG`, `AS5600`, a 2-DOF desktop arm), or run "
        "the depth firmware on a known-good reference board. | Occasional help is reasonable, "
        "especially the first breadboard, the first solder joint and the first current-limited "
        "bench. |",
        "| **3. Production practice (supervised sign-off)** | Design reviews, SIL/HIL fault "
        "injection, and commissioning of custom `24 V/15 A` or `48 V/30 A` hardware. | Requires "
        "an experienced engineer's review and a formal pre-bring-up safety sign-off; not a solo "
        "beginner promise. |",
        "",
        "## F. Fast-track entries",
        "",
        "Every bridge page carries its own Skip Test, and every ladder ends in a Gate test that",
        "spans every concept it introduces; 80% skips it, and 100% of the safety items is",
        "mandatory. A skipped page saves its own hours, which is what the table's last column",
        "sums - no entry claims hours it does not remove. The gates are catalogued in",
        "[`ASSESSMENTS.md`](ASSESSMENTS.md).",
        "",
        "| You already know | Pages to skip | Saves |",
        "| :--- | :--- | ---: |",
    ]
    for name, background, ids in ENTRY_PATHS:
        rows = [modules[ident] for ident in ids if ident in modules]
        found = [ident for ident in ids if ident not in modules]
        if found:
            raise SystemExit(
                f"the {name} entry names modules with no page: {', '.join(found)}; "
                f"check ENTRY_PATHS in scripts/generate_step_docs.py"
            )
        low, high = totals(rows)
        lines.append(
            f"| **{name}** - {background} | {', '.join('`' + ident + '`' for ident in ids)} "
            f"| {rng(low, high)} h |"
        )

    lines += [
        "",
        "## G. Modules outside both routes",
        "",
        f"{len(outside)} modules are graded, badgeable and not needed for the arm or either "
        "depth pass. They sit outside both routes, and the track READMEs list them as the "
        "optional pages rather than as a fourth depth.",
        "",
        "| Module | Focused hours |",
        "| :--- | ---: |",
    ]
    for row in outside:
        lines.append(f"| {module_link(row)} {row['title']} | {rng(row['low'], row['high'])} |")
    lines += [
        f"| **{len(outside)} modules** | **{rng(outside_low, outside_high)}** |",
        "",
        "## H. Validation protocol",
        "",
        "Every hour here is a provisional target until an outside beginner finishes the route. The",
        "pilot logs, per lesson, in",
        "[`.github/ISSUE_TEMPLATE/beginner-timing-log.md`](../.github/ISSUE_TEMPLATE/beginner-timing-log.md):",
        "",
        "1. **Where help was needed** - the hint or error that the built-in ladder could not carry.",
        "2. **Total time** - setup, coding and debugging, not just the scheduled lesson time.",
        "3. **First-attempt pass rate and delayed transfer** - whether the modified-parameter",
        "   version still works one to two weeks later.",
        "",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------------------------
# docs/CURRICULUM.md
# --------------------------------------------------------------------------------------------


def render_curriculum():
    facts = route_model.facts()
    steps = facts["steps"]
    owner = step_of_track()
    lines = [
        "# Curriculum architecture",
        "",
        "> **Audience:** maintainers, and learners who have finished a few steps and want the whole",
        "> map. The front page shows only **Steps 1-10**; this page keeps the internal vocabulary",
        "> (`T1`/`T2`/`T3`, folder names, module ids) those steps compile to, with what each costs.",
        "",
        "```mermaid",
        "flowchart LR",
        '    Steps["10 learner steps"] --> Ids["Folder and module ids"] --> Depth["T1 / T2 / T3 depth"]',
        "```",
        "",
        "## One name for a learner, one id for a maintainer",
        "",
        "A learner sees ten steps and nothing else. Each step is one folder - two folders for Step",
        "9 - and the modules inside it carry their depth in the id (`T1` = the arm pass, `T2` =",
        "model and apply, `T3` = derive and validate). The mapping is fixed here so no page explains",
        "it twice, and the hours are the pages' own metadata.",
        "",
        "| Step | Folder | Learner-facing title | Lessons | Arm layer | Depth 2 | Depth 3 | Focused hours |",
        "| ---: | :--- | :--- | ---: | :--- | :--- | :--- | ---: |",
    ]

    def cell_for(rows, low, high):
        if not rows:
            return "—"
        return f"{plural(len(rows), 'module')} · {rng(low, high)} h"

    for step in steps:
        folders = " + ".join(
            f"[`{folder}/`](../{folder}/README.md)" for folder in step_folders(step)
        )
        arm = "—" if not step["arm_module_count"] else (
            f"{plural(step['arm_module_count'], 'module')} · "
            f"{rng(step['arm_low'], step['arm_high'])} h"
        )
        lines.append(
            f"| {step['number']} | {folders} | {step['title']} | {step['lesson_count']} | "
            f"{arm} | "
            f"{cell_for(step['depth2_modules'], step['depth2_low'], step['depth2_high'])} | "
            f"{cell_for(step['depth3_modules'], step['depth3_low'], step['depth3_high'])} | "
            f"**{rng(step['low'], step['high'])}** |"
        )
    lines += [
        "",
        f"Totals: arm **{rng(facts['arm_low'], facts['arm_high'])} h**, Depth 2 "
        f"**{rng(facts['depth2_low'], facts['depth2_high'])} h**, Depth 3 "
        f"**{rng(facts['depth3_low'], facts['depth3_high'])} h**, full course "
        f"**{rng(facts['low'], facts['high'])} h**. The arm layer is every Tier 1 bridge plus the",
        "Step 10 capstone; Depth 2 is the Tier 2 practice pass and Depth 3 the Tier 3 derivation",
        "pass, both taken after Step 10 in the same step order. `scripts/route_model.py` is the",
        "declaration; this page and",
        "`docs/SYLLABUS.md` are rendered from it by `scripts/generate_step_docs.py`, and",
        "`scripts/check_consistency.py` fails when a step's lessons, layers or hours move without",
        "them being regenerated.",
        "",
        "## The ids each step compiles to",
        "",
        "The folder names above are for the reader; these are the ids a contributor edits, in the",
        "order the step asks for them (arm layer first, then the depth layer).",
        "",
        "| Step | Lesson ids | Arm module ids | Depth module ids |",
        "| ---: | :--- | :--- | :--- |",
    ]
    for step in steps:
        lines.append(
            f"| {step['number']} | {span(step['lessons'])} | {span(step['arm_modules'])} | "
            f"{span(step['depth_modules'])} |"
        )
    lines += [
        "",
        "## The three depth layers, per track",
        "",
        "Every step folder holds three layers. **Depth 1** is the arm: the Tier 1 bridge and the",
        "track's own lessons, in step order. **Depth 2** is the Tier 2 practice modules and",
        "**Depth 3** the Tier 3 derivation modules, both required and both taken after Step 10 in",
        "the same step order. A handful of pages sit **outside both routes**: still graded, still",
        "badgeable, never required, and not a fourth depth.",
        "",
        "| Track | Step | Depth 1 · arm | Depth 2 · practice | Depth 3 · derive | Outside both routes | What bridges maker work to custom work |",
        "| :--- | ---: | :--- | :--- | :--- | :--- | :--- |",
    ]
    for number, folder in enumerate(TRACKS):
        index = owner[number]
        step = steps[index]
        # Arm layer = the track's lessons plus its Tier 1 module; depth layer = its T2/T3 rows.
        arm_rows = step_lessons_in(step, number) + [
            row for row in step_modules_in(step, number) if route_model.module_layer(row["id"]) == "arm"
        ]
        depth_required = [
            row for row in step_modules_in(step, number) if route_model.module_layer(row["id"]) == "depth"
        ]
        optional_rows = outside_modules_in(index, number)
        arm_low, arm_high = totals(arm_rows)
        (t2_rows, (t2_low, t2_high)), (t3_rows, (t3_low, t3_high)) = depth_by_tier(
            depth_required
        )
        out_low, out_high = totals(optional_rows)
        heading = track_title(folder).replace("Track " + f"{number:02d}: ", "")

        def cell(rows, low, high):
            if not rows:
                return "—"
            return f"{len(rows)} · {rng(low, high)} h"

        lines.append(
            f"| **{heading}** | {step['number']} | {cell(arm_rows, arm_low, arm_high)} | "
            f"{cell(t2_rows, t2_low, t2_high)} | {cell(t3_rows, t3_low, t3_high)} | "
            f"{cell(optional_rows, out_low, out_high)} | {BRIDGES[folder]} |"
        )
    lines += [
        "",
        "## Where the other maps live",
        "",
        "| Question | Page |",
        "| :--- | :--- |",
        "| Where do I start, and what are the ten steps? | [`../README.md`](../README.md) |",
        "| What does each step cost, page by page? | [`SYLLABUS.md`](SYLLABUS.md) |",
        "| What pages are required for the arm, and how many hours? | [`SIM_ROUTE.md`](SIM_ROUTE.md) |",
        "| What is the optional depth pass? | [`DEPTH.md`](DEPTH.md) |",
        "| What is the smallest finish that still builds the arm? | [`MINIMUM.md`](MINIMUM.md) |",
        "| Which modules are optional, and what can I skip? | [`EXTENSIONS.md`](EXTENSIONS.md) |",
        "| What does CI check? | [`VERIFICATION.md`](VERIFICATION.md) |",
        "",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------------------------
# the nine track READMEs
# --------------------------------------------------------------------------------------------


def render_track(folder):
    owner = step_of_track()
    number = TRACKS.index(folder)
    step = step_by_number(owner[number] + 1)
    lessons = step_lessons_in(step, number)
    arm_rows = [row for row in step_modules_in(step, number) if route_model.module_layer(row["id"]) == "arm"]
    depth_rows = [row for row in step_modules_in(step, number) if route_model.module_layer(row["id"]) == "depth"]
    optional_rows = outside_modules_in(owner[number], number)
    lesson_low, lesson_high = totals(lessons)
    arm_low, arm_high = totals(arm_rows)
    (t2_rows, (t2_low, t2_high)), (t3_rows, (t3_low, t3_high)) = depth_by_tier(depth_rows)
    out_low, out_high = totals(optional_rows)
    layer1_low, layer1_high = totals(lessons + arm_rows)
    slice_low, slice_high = totals(lessons + arm_rows + depth_rows)

    anchors = ANCHORS.get(folder, DEFAULT_ANCHORS)

    def pages(rows, prefix="../modules/"):
        if not rows:
            return "—"
        return ", ".join(module_link(row, prefix) for row in rows)

    def lesson_ids():
        if not lessons:
            return "—"
        return ", ".join(
            f"[`{row['id']}`]({row['path'].split('/', 1)[1]})" for row in lessons
        )

    next_step_number = step["number"] + 1
    if next_step_number <= route_model.facts()["step_count"]:
        nxt = step_by_number(next_step_number)
        next_links = folder_links(nxt, "../")
        next_line = (
            f"**Next:** Step {nxt['number']} · {nxt['title']} → {next_links} "
            f"({rng(nxt['low'], nxt['high'])} focused hours)."
        )
    else:
        next_line = "**Last step:** the course ends here, at the capstone."

    folders = step_folders(step)
    if len(folders) > 1:
        take = (
            "Take Depth 1 with the other folder in this step rather than as a standalone course; "
            "Depth 2 and Depth 3 wait until Step 10 is finished."
        )
    elif t2_rows or t3_rows:
        take = "Take Depth 1 in order; Depth 2 and Depth 3 wait until Step 10 is finished."
    else:
        take = "Depth 1 is the whole required step; the two deeper builds below are optional."
    lead = (
        f"This folder is the reading for Step {step['number']}." if len(folders) == 1
        else f"This is one of the {len(folders)} folders for Step {step['number']}."
    )

    block = [
        OPEN,
        f"> **Step {step['number']} of {route_model.facts()['step_count']} · {step['title']}.** "
        f"{step['outcome']}",
        ">",
        f"> {lead} The ten steps are the only order the course uses; the three `Tier` sections",
        "> below are its three depth layers, and the headings keep their old names because the",
        "> module pages link to them. Read `Tier 1` as Depth 1 of this step, `Tier 2` as",
        "> Depth 2, `Tier 3` as Depth 3; a page marked optional sits outside both routes,",
        f"> whatever its tier. {take}",
        *([f">\n> {EXTRAS[folder]}"] if folder in EXTRAS else []),
        "",
        "| Depth | What it is | Pages in this track | Focused hours |",
        "| :--- | :--- | :--- | ---: |",
        f"| **1 · arm** | [Step {step['number']}](#{anchors[0]}), in order | "
        f"{lesson_ids()} · {pages(arm_rows)} | {rng(layer1_low, layer1_high)} |",
        f"| **2 · practice** | [after Step 10](#{anchors[1]}), same step order | "
        f"{pages(t2_rows)} | {rng(t2_low, t2_high) if t2_rows else '—'} |",
        f"| **3 · derive** | [after the practice pass](#{anchors[2]}), same step order | "
        f"{pages(t3_rows)} | {rng(t3_low, t3_high) if t3_rows else '—'} |",
        f"| **outside both routes** | [optional](#{anchors[2]}), graded, never required | "
        f"{pages(optional_rows)} | {rng(out_low, out_high) if optional_rows else '—'} |",
        "",
        f"**Step {step['number']} costs {rng(step['low'], step['high'])} focused hours in total** - "
        + ", ".join(
            part for part in (
                f"{rng(lesson_low, lesson_high)} of lessons" if lessons else "",
                f"{rng(arm_low, arm_high)} of arm modules" if arm_rows else "",
                f"{rng(t2_low, t2_high)} of Depth 2 practice" if t2_rows else "",
                f"{rng(t3_low, t3_high)} of Depth 3 derivation" if t3_rows else "",
            ) if part
        )
        + (
            " - shared by " + " and ".join(folder_label(f) for f in folders)
            + f", this one's pages are {rng(slice_low, slice_high)} of it"
            if len(folders) > 1 else ""
        )
        + " - out of a **"
        f"{rng(route_model.facts()['low'], route_model.facts()['high'])} focused-hour** course. "
        "Hours are each page's own metadata; [`docs/SYLLABUS.md`](../docs/SYLLABUS.md) is the "
        "full column, and [`docs/CURRICULUM.md`](../docs/CURRICULUM.md) maps steps to ids.",
        "",
        next_line,
        CLOSE,
    ]
    text = read(os.path.join(ROOT, folder, "README.md"))
    return splice(text, "\n".join(block), f"{folder}/README.md")


def splice(text, block_text, name):
    """Put the block where the old navigation table was, or where the markers already are.

    A README with neither is an error: silently skipping it is how a track ends up back on the
    pass table without anyone noticing.
    """
    text = text.replace(OLD_COURSE_NAME, NEW_COURSE_NAME)
    if OPEN in text:
        if text.count(OPEN) != 1 or text.count(CLOSE) != 1:
            raise SystemExit(f"{name} has {text.count(OPEN)} `{OPEN}` and {text.count(CLOSE)} `{CLOSE}` marks; expected one of each")
        head, rest = text.split(OPEN, 1)
        _, tail = rest.split(CLOSE, 1)
        return head + block_text + tail
    marker = text.find(LEGACY_HEADING)
    if marker == -1:
        raise SystemExit(
            f"{name} has neither the generated block nor the old navigation table; "
            f"add {OPEN} ... {CLOSE} above the first section"
        )
    end = text.find("\n---\n", marker)
    if end == -1:
        raise SystemExit(f"{name}'s old navigation table has no closing `---`")
    return text[:marker] + block_text + text[end:]


# --------------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------------


def outputs():
    """`{path: rendered text}` for every generated page."""
    pages = {
        SYLLABUS: render_syllabus(),
        CURRICULUM: render_curriculum(),
    }
    for folder in TRACKS:
        pages[os.path.join(ROOT, folder, "README.md")] = render_track(folder)
    return pages


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report stale pages instead of writing")
    args = parser.parse_args(argv)

    pages = outputs()
    stale = []
    for path, rendered in pages.items():
        current = read(path) if os.path.exists(path) else ""
        if current != rendered:
            stale.append(path)
            if not args.check:
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(rendered)
    rel = [os.path.relpath(path, ROOT) for path in stale]
    if args.check:
        if stale:
            print("ERROR: stale step costing in " + ", ".join(rel) + "; run python3 scripts/generate_step_docs.py")
            return 1
        print(f"OK: {len(pages)} pages cost the course by the ten-step spine.")
        return 0
    if stale:
        print(f"wrote {len(stale)} page(s): " + ", ".join(rel))
    else:
        print("step costing already current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
