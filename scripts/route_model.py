#!/usr/bin/env python3
"""The learner-facing route: ten steps, one name each.

The course has an internal structure (`T1`/`T2`/`T3` module ids, a "Core" route and
"Extensions"). A newcomer should never have to learn that vocabulary, so every page a
newcomer reads is generated from this one model instead: **Step 1** through **Step 10**.

Each step names the prose lessons and the practice modules it contains. Hours come from the
pages' own front matter (`typical_hours` / `slow_learner_hours` for lessons, `est_hours` for
modules) - this file never invents a duration. `scripts/generate_readme_counts.py` renders the
README table from `step_facts()`; `scripts/check_consistency.py` compares the model with
`generate_sim_route.CORE_MODULES` so the learner view and the required-route view cannot drift.
"""

import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Ten steps, in order. `lessons` are globs of prose pages; `modules` are module ids that are
# required; `optional` names modules a learner may skip without losing the finished arm.
STEPS = [
    {
        "number": 1,
        "slug": "python",
        "title": "Python and the maths a robot needs",
        "outcome": "Read a formula, write it in Python, and check your own answer.",
        "start": "track-p/P.1-variables-and-data-types.md",
        "lessons": ["track-p/P.*.md"],
        "modules": [],
        "optional": [],
    },
    {
        "number": 2,
        "slug": "circuits",
        "title": "Circuits and your first microcontroller",
        "outcome": "Light an LED, read a knob, and dim it with PWM without breaking anything.",
        "start": "stage-0/S0.0-why-electricity-is-like-flow.md",
        "lessons": ["stage-0/S0.*.md"],
        "modules": [],
        "optional": [],
    },
    {
        "number": 3,
        "slug": "foundations",
        "title": "Make a joint move: foundations",
        "outcome": "Model a spring, a damper, and a motor as one joint that responds to torque.",
        "start": "00-foundations/00.1-effort-flow-and-first-order-lag.md",
        "lessons": ["00-foundations/0*.md"],
        "modules": [
            "00-foundations.T1.00a", "00-foundations.T1.00b", "00-foundations.T1.00c",
            "00-foundations.T1.00d", "00-foundations.T1.00e",
            "00-foundations.T2.00a", "00-foundations.T2.00b", "00-foundations.T2.00c",
            "00-foundations.T2.00d", "00-foundations.T2.00e", "00-foundations.T2.00f",
            "00-foundations.T2.00g", "00-foundations.T2.00h", "00-foundations.T2.00i",
            "00-foundations.T2.00j",
            "00-foundations.T3.00a",
        ],
        "optional": [],
    },
    {
        "number": 4,
        "slug": "electronics",
        "title": "Power the joint: electronics",
        "outcome": "Switch a motor both ways, budget its current, and keep the switching noise out.",
        "start": "01-electronics-and-power/01.1-mosfet-inductor-flyback.md",
        "lessons": ["01-electronics-and-power/0*.md"],
        "modules": [
            "01-electronics.T1.01a", "01-electronics.T1.01b", "01-electronics.T1.01c",
            "01-electronics.T1.01d",
            "01-electronics.T2.01a", "01-electronics.T2.01b",
        ],
        "optional": [],
    },
    {
        "number": 5,
        "slug": "mechanics",
        "title": "Build the arm: mechanics",
        "outcome": "Turn joint angles into a tip position, and a tip position back into joint angles.",
        "start": "02-mechanics-kinematics-dynamics/02.1-1d-link-fk-and-coord-frames.md",
        "lessons": ["02-mechanics-kinematics-dynamics/0*.md"],
        "modules": [
            "02-mechanics.T1.02a", "02-mechanics.T2.02a", "02-mechanics.T3.02a",
        ],
        "optional": [],
    },
    {
        "number": 6,
        "slug": "sensors",
        "title": "Measure the joint: sensors",
        "outcome": "Read an encoder, compute a clean angle, and know how much to trust it.",
        "start": "03-sensors-and-actuators/03.1-quadrature-and-magnetic-encoders.md",
        "lessons": ["03-sensors-and-actuators/0*.md"],
        "modules": ["03-sensors.T1.03a", "03-sensors.T2.03a"],
        "optional": [],
    },
    {
        "number": 7,
        "slug": "embedded",
        "title": "Run it in real time: embedded C",
        "outcome": "Move a fixed-rate control loop off Python and onto a microcontroller.",
        "start": "04-embedded-and-realtime/04.1-c-types-and-hardware-timer-isr.md",
        "lessons": ["04-embedded-and-realtime/0*.md"],
        "modules": [
            "04-embedded.T1.04a", "04-embedded.T1.04b",
            "04-embedded.T2.04a", "04-embedded.T2.04b",
        ],
        "optional": ["04-embedded.T2.04c", "04-embedded.T2.04d"],
    },
    {
        "number": 8,
        "slug": "control",
        "title": "Make it hold still: control",
        "outcome": "Tune a PID that holds the arm against gravity without overshooting.",
        "start": "05-control-and-estimation/05.1-pid-virtual-spring-damper-and-anti-windup.md",
        "lessons": ["05-control-and-estimation/0*.md"],
        "modules": [
            "05-control.T1.05a", "05-control.T2.05a",
            "05-control.T3.05a", "05-control.T3.05b", "05-control.T3.05c",
        ],
        "optional": [],
    },
    {
        "number": 9,
        "slug": "robotics",
        "title": "Plan motion and bring it up safely",
        "outcome": "Smooth a path, identify the plant, and run a bring-up that fails safe.",
        "start": "06-robotics-and-autonomy/06.1-cubic-trajectories-and-compliant-joints.md",
        "lessons": ["06-robotics-and-autonomy/06.*.md", "07-systems-hil-and-production/07.*.md"],
        "modules": [
            "06-robotics.T1.06a", "07-systems.T1.07a", "07-systems.T2.07a",
        ],
        # ROS 2 is the most common place a self-guided beginner stops; its two modules stay
        # graded and badgeable, and the arm does not need a local ROS 2 install to finish.
        "optional": ["06-robotics.T2.06a", "06-robotics.T2.06b"],
    },
    {
        "number": 10,
        "slug": "capstone",
        "title": "Put it together: the 2-DOF arm",
        "outcome": "Run a figure-8 path on a simulated arm, then recover from four planted faults.",
        "start": "08-capstone-projects/08.1-tier1-2dof-compliant-arm-capstone.md",
        "lessons": ["08-capstone-projects/08.1-*.md"],
        "modules": ["08-capstones.T3.07a"],
        "optional": [],
    },
]

STEP_COUNT = len(STEPS)


def frontmatter(path):
    """The leading `---` block as a dict of scalars (lists stay raw text)."""
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return {}
    data = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith(" "):
            data[key.strip()] = value.strip().strip('"')
    return data


def parse_hours(spec):
    """'1.0-1.5' -> (1.0, 1.5); '3.0' -> (3.0, 3.0); missing -> None."""
    if not spec:
        return None
    found = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", spec)]
    if not found:
        return None
    return (found[0], found[1] if len(found) > 1 else found[0])


def lesson_order(ident):
    """Numeric-aware order: 'P.2' < 'P.10'."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", ident)]


def _fmt_range(low, high):
    if abs(low - high) < 1e-9:
        return f"{low:g}"
    return f"{low:g}–{high:g}"


def step_lessons(step):
    """Lesson rows for one step, in lesson-number order, with their metadata hours."""
    rows = []
    seen = set()
    for pattern in step["lessons"]:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            if rel.endswith("README.md"):
                continue
            meta = frontmatter(path)
            ident = meta.get("lesson_id", "")
            if not ident or ident in seen:
                continue
            seen.add(ident)
            typical = parse_hours(meta.get("typical_hours", ""))
            slow = parse_hours(meta.get("slow_learner_hours", ""))
            rows.append(
                {
                    "id": ident,
                    "title": meta.get("title", "").strip('"'),
                    "path": rel,
                    "low": typical[0] if typical else None,
                    "high": slow[1] if slow else (typical[1] if typical else None),
                }
            )
    rows.sort(key=lambda row: lesson_order(row["id"]))
    return rows


def all_modules():
    """Every module page as `{id: {title, tier, hours}}`."""
    rows = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "modules", "*.md"))):
        meta = frontmatter(path)
        ident = meta.get("id", "")
        if not ident:
            continue
        hours = parse_hours(meta.get("est_hours", ""))
        rows[ident] = {
            "id": ident,
            "title": meta.get("title", "").strip('"'),
            "tier": meta.get("tier", ""),
            "low": hours[0] if hours else None,
            "high": hours[1] if hours else None,
        }
    return rows


def step_modules(step):
    """The required module rows for one step; a named id with no page is a hard error."""
    modules = all_modules()
    missing = [ident for ident in step["modules"] if ident not in modules]
    if missing:
        raise SystemExit(
            f"Step {step['number']} names modules with no page: {', '.join(missing)}; "
            f"check scripts/route_model.py against modules/*.md"
        )
    return [modules[ident] for ident in step["modules"]]


def step_optional(step):
    """Modules a learner may skip without losing the finished arm (still graded)."""
    modules = all_modules()
    return [modules[ident] for ident in step["optional"] if ident in modules]


# The arm layer is every Tier 1 bridge plus the final capstone; the depth layer is every other
# module in the step. The split is what makes the order unambiguous: the arm is taken in Steps
# 1-10 first, the depth layer is a second pass in the same step order, and 00-foundations says
# exactly that. Without it, Step 3's sixteen modules read as "do Tier 2 before hardware".
ARM_CAPSTONE_ID = "08-capstones.T3.07a"


def module_layer(ident):
    """`arm` for a Tier 1 bridge or the capstone, `depth` for Tier 2/3 practice."""
    return "arm" if ident == ARM_CAPSTONE_ID or ".T1." in ident else "depth"


def depth_tier(row):
    """Which depth column a practice module belongs to: 2 or 3, from its own front matter.

    The matrix compares Depth 2 and Depth 3 side by side, so each column needs hours of its
    own. Anything that is not a Tier 2 or 3 page is a modelling error rather than a module
    with zero hours: silently dropping it from both columns is how a cost disappears.
    """
    tier = str(row.get("tier", "")).strip()
    if tier not in ("2", "3"):
        raise SystemExit(
            f"module {row['id']} has tier {tier!r}; a depth module must declare tier: 2 or 3 "
            f"so the matrix's Depth 2/3 columns can cost it"
        )
    return int(tier)


def step_facts(step):
    """One row: lessons, arm and depth modules, hours, first lesson link."""
    lessons = step_lessons(step)
    modules = step_modules(step)
    arm = [row for row in modules if module_layer(row["id"]) == "arm"]
    depth = [row for row in modules if module_layer(row["id"]) == "depth"]
    low = high = 0.0
    for row in lessons + modules:
        low += row["low"] or 0.0
        high += row["high"] or 0.0
    arm_low = sum(row["low"] or 0.0 for row in lessons + arm)
    arm_high = sum(row["high"] or 0.0 for row in lessons + arm)
    depth_low = sum(row["low"] or 0.0 for row in depth)
    depth_high = sum(row["high"] or 0.0 for row in depth)
    depth2 = [row for row in depth if depth_tier(row) == 2]
    depth3 = [row for row in depth if depth_tier(row) == 3]
    depth2_low = sum(row["low"] or 0.0 for row in depth2)
    depth2_high = sum(row["high"] or 0.0 for row in depth2)
    depth3_low = sum(row["low"] or 0.0 for row in depth3)
    depth3_high = sum(row["high"] or 0.0 for row in depth3)
    return {
        "number": step["number"],
        "slug": step["slug"],
        "title": step["title"],
        "outcome": step["outcome"],
        "start": step["start"],
        "lessons": lessons,
        "modules": modules,
        "arm_modules": arm,
        "depth_modules": depth,
        "optional": step_optional(step),
        "lesson_count": len(lessons),
        "module_count": len(modules),
        "arm_module_count": len(arm),
        "depth_module_count": len(depth),
        "low": round(low, 2),
        "high": round(high, 2),
        "arm_low": round(arm_low, 2),
        "arm_high": round(arm_high, 2),
        "depth_low": round(depth_low, 2),
        "depth_high": round(depth_high, 2),
        "depth2_modules": depth2,
        "depth3_modules": depth3,
        "depth2_low": round(depth2_low, 2),
        "depth2_high": round(depth2_high, 2),
        "depth3_low": round(depth3_low, 2),
        "depth3_high": round(depth3_high, 2),
        "hours": _fmt_range(round(low, 2), round(high, 2)),
    }


def facts():
    """Totals for the front page: 10 steps, the lessons and modules they hold, their hours."""
    steps = [step_facts(step) for step in STEPS]
    return {
        "steps": steps,
        "step_count": len(steps),
        "lesson_count": sum(row["lesson_count"] for row in steps),
        "module_count": sum(row["module_count"] for row in steps),
        "arm_module_count": sum(row["arm_module_count"] for row in steps),
        "depth_module_count": sum(row["depth_module_count"] for row in steps),
        "optional_count": sum(len(row["optional"]) for row in steps),
        "low": round(sum(row["low"] for row in steps), 2),
        "high": round(sum(row["high"] for row in steps), 2),
        "arm_low": round(sum(row["arm_low"] for row in steps), 2),
        "arm_high": round(sum(row["arm_high"] for row in steps), 2),
        "depth_low": round(sum(row["depth_low"] for row in steps), 2),
        "depth_high": round(sum(row["depth_high"] for row in steps), 2),
        "depth2_low": round(sum(row["depth2_low"] for row in steps), 2),
        "depth2_high": round(sum(row["depth2_high"] for row in steps), 2),
        "depth3_low": round(sum(row["depth3_low"] for row in steps), 2),
        "depth3_high": round(sum(row["depth3_high"] for row in steps), 2),
        "depth2_module_count": sum(len(row["depth2_modules"]) for row in steps),
        "depth3_module_count": sum(len(row["depth3_modules"]) for row in steps),
        "hours": _fmt_range(round(sum(row["low"] for row in steps), 2),
                            round(sum(row["high"] for row in steps), 2)),
    }


def module_count_total():
    """Formal modules on disk plus the legacy entries indexed in modules/_index.yaml."""
    with open(os.path.join(ROOT, "modules", "_index.yaml"), encoding="utf-8") as handle:
        text = handle.read()
    legacy_block = text.split("legacy:", 1)[1].split("bridges:", 1)[0] if "legacy:" in text else ""
    legacy = len(re.findall(r"^\s*-\s+id:", legacy_block, re.M))
    return legacy + len(all_modules())


def first_lesson_href(step):
    """Workspace-relative link to the step's first lesson, URL-safe for Markdown."""
    return step["start"].replace(" ", "%20")


def first_lesson_href_from_row(row):
    """The same link, from a `step_facts()` row."""
    return row["start"].replace(" ", "%20")
