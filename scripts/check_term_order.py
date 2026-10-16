#!/usr/bin/env python3
"""
scripts/check_term_order.py — Automated curriculum term-order and prerequisite order verifier.

Verifies two strict pedagogical invariants:
1. Prerequisite Order: In `PLAN-batch-1.md` and across all beginner lessons (`Track P` -> `Stage 0` ->
   `Track 00` -> `Track 01` -> `Track 02`), every prerequisite lesson ID listed in a lesson's
   `Prerequisites` section (or in `PLAN-batch-1.md`) must appear strictly earlier in curriculum path order.
2. Glossary Term Order: For every glossary term in `resources/glossary.md`, finds the earliest lesson
   (in curriculum path order) that uses the term in its body text (excluding forward `Next lesson:` links
   and `What to skip:` lines) and fails if that lesson comes BEFORE the lesson that defines the term.

Usage:
    python3 scripts/check_term_order.py
    python3 scripts/check_term_order.py --plan PLAN-batch-1.md
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLOSSARY_PATH = os.path.join(ROOT, "resources", "glossary.md")
PLAN_PATH = os.path.join(ROOT, "docs", "PLAN-batch-1.md")

PATH_ORDER_IDS = [
    "P.1", "P.2", "P.3", "P.4", "P.5", "P.6", "P.7", "P.8", "P.9", "P.10", "P.11", "P.12", "P.M",
    "S0.1", "S0.2", "S0.3", "S0.4", "S0.5", "S0.6", "S0.7", "S0.8", "S0.9", "S0.M",
    "00.1", "00.2", "00.3",
    "01.1", "01.2", "01.3", "01.4",
    "02.1", "02.2", "02.3", "02.4", "02.5",
    "03.1", "03.2",
    "04.1", "04.2",
    "05.1", "05.2",
    "06.1",
    "07.1",
    "08.1",
]

# Explicit search patterns for each glossary term so multi-word phrases and technical terms
# are matched accurately in lesson body text.
TERM_PATTERNS: dict[str, str] = {
    "Variable": r"\bvariables?\b",
    "Assignment (`=`)": r"\bassignment\b",
    "Integer (`int`)": r"\bintegers?\b|\bint\b",
    "Float (`float`)": r"\bfloating-point\b|\bfloats?\b",
    "String (`str`)": r"\bstrings?\b|\bstr\b",
    "Boolean (`bool`)": r"\bbooleans?\b|\bbool\b",
    "Order of Operations": r"\border of operations\b|\bpemdas\b",
    "Clamping (Saturation)": r"\bclamp(?:ing|ed|s)?\b",
    "Zero-Based Indexing": r"\bzero-based index(?:ing)?\b",
    "Function (`def` / `return`)": r"\bfunctions?\b|\bdef\b",
    "Assertion (`assert`)": r"\bassertions?\b|\bassert\b",
    "Base SI Units": r"\bbase si units?\b",
    "Metric Prefixes": r"\bmetric prefix(?:es)?\b",
    "Frequency ($f$)": r"\bfrequency\b|\bhertz\b",
    "Period ($T$)": r"\bperiod\b",
    "Binary Bit": r"\bbinary\b|\b\d+-bit\b",
    "Linear Range Scaling": r"\blinear(?:ly)?\s+(?:range\s+)?scal(?:ing|e)\b",
    "Radian (`rad`)": r"\bradians?\b",
    "Angular Velocity ($\\omega$)": r"\bangular velocity\b|\brad/s\b",
    "Four-Quadrant Inverse Tangent (`atan2`)": r"\batan2\b",
    "Graph Slope (Rate of Change)": r"\bslope\b",
    "Area Under a Curve (Accumulation)": r"\barea on a v-t graph\b|\brectangle area\b",
    "Force ($F$) and Weight ($W$)": r"\bnewton's second law\b|\bgravitational weight\b",
    "Lever Arm ($r_\\perp$)": r"\blever arm\b",
    "Lever Torque ($\\tau$)": r"\btorque\b",
    "Ground (`GND`)": r"\bground\b|\bgnd\b",
    "Voltage ($V$)": r"\bvoltages?\b",
    "Current ($I$)": r"\bcurrents?\b",
    "Resistance ($R$)": r"\bresistances?\b|\bresistors?\b",
    "Ohm's Law": r"\bohm's law\b",
    "Series Circuit": r"\bseries\s+(?:circuit|resistor|current)\b|\bin series\b",
    "Parallel Circuit": r"\bparallel\s+(?:circuit|resistor|branch)\b|\bin parallel\b",
    "Voltage Divider": r"\bvoltage dividers?\b",
    "Potentiometer": r"\bpotentiometers?\b",
    "Solderless Breadboard": r"\bbreadboards?\b",
    "Short Circuit": r"\bshort circuits?\b|\bshort-circuit\b",
    "LED (Light-Emitting Diode)": r"\bleds?\b|\blight-emitting diodes?\b",
    "Forward Voltage ($V_f$)": r"\bforward voltage\b",
    "Electrical Power ($P$)": r"\belectrical power\b|\bmilliwatts?\b|\bpower ratings?\b",
    "Voltmeter and Ammeter": r"\bvoltmeters?\b|\bammeters?\b|\bmultimeters?\b",
    "CC/CV Bench Supply": r"\bconstant-current\b|\bbench(?:top)? power suppl(?:y|ies)\b|\bcc/cv\b",
    "Capacitor ($C$)": r"\bcapacitors?\b|\bfarads?\b|\bmicrofarads?\b",
    "Decoupling Capacitor": r"\bdecoupling capacitors?\b|\bbypass capacitors?\b",
    "Digital I/O (`pinMode`, `digitalWrite`, `digitalRead`)": r"\bdigitalwrite\b|\bdigitalread\b|\bpinmode\b",
    "Pull-Up Resistor (`INPUT_PULLUP`)": r"\binput_pullup\b|\bpull-up resistors?\b",
    "Serial Monitor (UART)": r"\bserial\.begin\b|\bserial monitor\b",
    "ADC (Analog-to-Digital Converter)": r"\banalog-to-digital\b|\banalogread\b|\badc\b",
    "PWM (Pulse-Width Modulation)": r"\bpulse-width modulation\b|\banalogwrite\b|\bpwm\b",
    "Effort and Flow": r"\beffort\s+and\s+flow\b|\beffort\s*\\times\s*flow\b",
    "Mechanical Power": r"\bmechanical power\b",
    "First-Order Lag": r"\bfirst-order lag\b",
    "Hooke's Law": r"\bhooke's law\b",
    "Spring Constant ($k$)": r"\bspring constant\b|\bspring restoring force\b",
    "Viscous Damping ($b$)": r"\bviscous damping\b|\bdamper\b",
    "Natural Frequency ($\\omega_n$)": r"\bnatural frequency\b",
    "Damping Ratio ($\\zeta$)": r"\bdamping ratio\b|\bunderdamped\b|\bcritically damped\b",
    "Dimensional Consistency": r"\bdimensional\s+(?:unit\s+)?consistency\b",
    "Sign Convention": r"\bsign conventions?\b",
    "MOSFET (N-Channel)": r"\bmosfets?\b",
    "Common Ground": r"\bcommon ground\b",
    "Inductor ($L$)": r"\binductors?\b|\bmillihenries\b|\bhenries\b",
    "Inductive Kickback": r"\binductive kickback\b",
    "Flyback Diode": r"\bflyback diodes?\b",
    "H-Bridge": r"\bh-bridges?\b",
    "Shoot-Through": r"\bshoot-through\b",
    "Back-EMF ($V_{\\text{emf}}$)": r"\bback-emf\b",
    "Stall Current ($I_{\\text{stall}}$)": r"\bstall current\b",
    "Linear Regulator (LDO)": r"\blinear regulators?\b|\bldos?\b",
    "Buck Converter": r"\bbuck converters?\b",
    "Power Budget": r"\bpower budget(?:s|ing)?\b",
    "Ground Bounce": r"\bground bounce\b",
    "Star Ground": r"\bstar[- ]ground(?:ing)?\b",
    "Low-Pass Filter": r"\blow-pass filters?\b",
    "Cutoff Frequency ($f_c$)": r"\bcutoff frequency\b",
    "Coordinate Frame": r"\bcoordinate frames?\b",
    "Forward Kinematics (FK)": r"\bforward kinematics\b",
    "Workspace": r"\bworkspaces?\b",
    "Relative Joint Angle": r"\brelative\s+(?:elbow\s+)?joint angles?\b",
    "End-Effector": r"\bend-effectors?\b",
    "Inverse Kinematics (IK)": r"\binverse kinematics\b",
    "Law of Cosines": r"\blaw of cosines\b",
    "Kinematic Singularity": r"\bkinematic singularit(?:y|ies)\b",
    "Moment of Inertia ($I_{\\text{rot}}$)": r"\bmoment of inertia\b|\brotational inertia\b",
    "Angular Acceleration ($\\alpha$)": r"\bangular acceleration\b",
    "Gear Ratio ($N$)": r"\bgear\s+(?:reduction\s+)?ratios?\b|\breflected inertia\b",
    "Backlash": r"\bbacklash\b",
    "Double Shear": r"\bdouble[- ]shear\b|\bcantilevered\b",
    "Timing Belt Pitch": r"\btiming belts?\b|\bgt2\b",
    "Clearance Fit": r"\bclearance fits?\b",
    "Quadrature Encoder": r"\bquadrature encoders?\b",
    "Absolute Magnetic Encoder": r"\babsolute magnetic encoders?\b|\bas5600\b",
    "Pole Pairs ($N_p$)": r"\bpole pairs?\b",
    "Electrical Angle ($\\theta_e$)": r"\belectrical angles?\b",
    "Interrupt Service Routine (ISR)": r"\binterrupt service routines?\b",
    "Volatile Variable (`volatile`)": r"\bvolatile\b",
    "Packed Binary Struct": r"\bpacked binary\b",
    "XOR Checksum (`crc8`)": r"\bxor checksums?\b",
    "PID Controller": r"\bpid controllers?\b",
    "Integrator Windup": r"\bintegrator windup\b|\banti-windup\b",
    "Gyroscope Bias": r"\bgyroscope bias\b",
    "Complementary IMU Filter": r"\bcomplementary imu filters?\b",
    "Cubic Polynomial Trajectory": r"\bcubic polynomial trajector(?:y|ies)\b",
    "Gravity Feedforward": r"\bgravity feedforward\b",
    "Encoder-to-Actuator Sign Verification": r"\bencoder-to-actuator sign verification\b",
    "Sine-Sweep System Identification": r"\bsine-sweep system identification\b",
    "Figure-8 Trajectory": r"\bfigure-8\b",
}


def parse_glossary() -> list[tuple[str, str, str]]:
    """Return list of (raw_term_name, regex_pattern, defined_lesson_id) from resources/glossary.md."""
    with open(GLOSSARY_PATH, "r", encoding="utf-8") as f:
        text = f.read()
    entries: list[tuple[str, str, str]] = []
    row_re = re.compile(
        r"^\|\s*\*\*([^*]+)\*\*\s*\|[^|]+\|[^|]+\|\s*\[Lesson\s+([A-Z0-9.]+)\]",
        re.MULTILINE,
    )
    for m in row_re.finditer(text):
        raw_term = m.group(1).strip()
        lesson_id = m.group(2).strip()
        if raw_term not in TERM_PATTERNS:
            raise KeyError(f"Glossary term '{raw_term}' missing explicit regex in TERM_PATTERNS")
        entries.append((raw_term, TERM_PATTERNS[raw_term], lesson_id))
    return entries


def check_plan(plan_path: str, glossary_entries: list[tuple[str, str, str]]) -> list[str]:
    """Verify prerequisite order and glossary term order in PLAN-batch-1.md."""
    errors: list[str] = []
    if not os.path.isfile(plan_path):
        return [f"Missing plan file: {plan_path}"]
    with open(plan_path, "r", encoding="utf-8") as f:
        text = f.read()

    # Parse table rows in PLAN-batch-1.md:
    # | **`00.1`** | `path` | Title | Ideas | Prereqs | New Terms | Sim | Time |
    row_re = re.compile(
        r"^\|\s*\*\*`([^`]+)`\*\*\s*\|\s*`([^`]+)`\s*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|",
        re.MULTILINE,
    )
    plan_lessons = []
    for m in row_re.finditer(text):
        lid = m.group(1).strip()
        lpath = m.group(2).strip()
        title = m.group(3).strip()
        ideas_col = m.group(4).strip()
        prereq_col = m.group(5).strip()
        terms_col = m.group(6).strip()
        plan_lessons.append((lid, lpath, title, ideas_col, prereq_col, terms_col))

    if not plan_lessons:
        errors.append("No lesson rows parsed from PLAN-batch-1.md")
        return errors

    for lid, _lpath, title, ideas_col, prereq_col, _terms_col in plan_lessons:
        if lid not in PATH_ORDER_IDS:
            errors.append(f"Plan lesson ID '{lid}' not in PATH_ORDER_IDS")
            continue
        lid_idx = PATH_ORDER_IDS.index(lid)
        prereq_ids = re.findall(r"`([A-Z0-9.]+)`", prereq_col)
        for pid in prereq_ids:
            if pid not in PATH_ORDER_IDS:
                errors.append(f"Plan lesson {lid}: unknown prerequisite '{pid}'")
            elif PATH_ORDER_IDS.index(pid) >= lid_idx:
                errors.append(
                    f"Plan lesson {lid}: prerequisite '{pid}' is not earlier in path order"
                )
        # Check whether ideas_col uses any glossary term defined AFTER lid
        plan_snippet = f"{title} {ideas_col}"
        for raw_term, pattern, def_lid in glossary_entries:
            def_idx = PATH_ORDER_IDS.index(def_lid)
            if def_idx > lid_idx and re.search(pattern, plan_snippet, flags=re.IGNORECASE):
                errors.append(
                    f"Plan lesson {lid} uses glossary term '{raw_term}' before {def_lid} defines it"
                )
    return errors


def discover_existing_lessons() -> list[tuple[str, str]]:
    """Return ordered list of (lesson_id, filepath) for all existing beginner lessons."""
    all_md = (
        glob.glob(os.path.join(ROOT, "track-p", "P.*.md"))
        + glob.glob(os.path.join(ROOT, "stage-0", "S0.*.md"))
        + glob.glob(os.path.join(ROOT, "00-foundations", "00.*.md"))
        + glob.glob(os.path.join(ROOT, "01-electronics-and-power", "01.*.md"))
        + glob.glob(os.path.join(ROOT, "02-mechanics-kinematics-dynamics", "02.*.md"))
        + glob.glob(os.path.join(ROOT, "03-sensors-and-actuators", "03.*.md"))
        + glob.glob(os.path.join(ROOT, "04-embedded-and-realtime", "04.*.md"))
        + glob.glob(os.path.join(ROOT, "05-control-and-estimation", "05.*.md"))
        + glob.glob(os.path.join(ROOT, "06-robotics-and-autonomy", "06.*.md"))
        + glob.glob(os.path.join(ROOT, "07-systems-hil-and-production", "07.*.md"))
        + glob.glob(os.path.join(ROOT, "08-capstone-projects", "08.*.md"))
    )
    by_id: dict[str, str] = {}
    for path in all_md:
        with open(path, "r", encoding="utf-8") as f:
            head = f.read(500)
        m = re.search(r'^lesson_id:\s*"?([^"\n]+)"?\s*$', head, flags=re.MULTILINE)
        if m:
            by_id[m.group(1).strip()] = path
    ordered: list[tuple[str, str]] = []
    for lid in PATH_ORDER_IDS:
        if lid in by_id:
            ordered.append((lid, by_id[lid]))
    return ordered


def strip_forward_navigation(markdown_text: str) -> str:
    """Strip YAML frontmatter, Mermaid flowchart previews, 'What to skip:' lines, and 'Next lesson:' links."""
    body = re.sub(r"^---\n.*?\n---\n", "", markdown_text, flags=re.DOTALL)
    body = re.sub(r"```mermaid.*?```", "", body, flags=re.DOTALL)
    body = re.sub(r"^.*?\*\*What to skip:\*\*.*$", "", body, flags=re.MULTILINE)
    body = re.sub(r"^.*?\*\*Next [Ll]esson:\*\*.*$", "", body, flags=re.MULTILINE)
    body = re.sub(r"^>\s*\*\*🔭 Looking Ahead.*$", "", body, flags=re.MULTILINE)
    return body


def check_lessons(glossary_entries: list[tuple[str, str, str]]) -> tuple[list[str], int]:
    """Verify prerequisite order and glossary term order across all existing lesson markdown files."""
    errors: list[str] = []
    lessons = discover_existing_lessons()
    cleaned_bodies: dict[str, str] = {}

    for lid, path in lessons:
        lid_idx = PATH_ORDER_IDS.index(lid)
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        # Check Prerequisites section links
        prereq_sec = re.search(r"^## Prerequisites\s*$(.*?)(?=^## |\Z)", raw, flags=re.MULTILINE | re.DOTALL)
        if prereq_sec:
            prereq_text = re.sub(r"```mermaid.*?```", "", prereq_sec.group(1), flags=re.DOTALL)
            for m in re.finditer(r"\b(P\.\d+|P\.M|S0\.\d+|S0\.M|0[0-8]\.\d+)\b", prereq_text):
                pid = m.group(1)
                if pid in PATH_ORDER_IDS and PATH_ORDER_IDS.index(pid) >= lid_idx:
                    errors.append(
                        f"{os.path.relpath(path, ROOT)} ({lid}) lists prerequisite {pid} which is not earlier in path order"
                    )
        cleaned_bodies[lid] = strip_forward_navigation(raw)

    existing_ids = [lid for lid, _ in lessons]
    checked_terms = 0
    for raw_term, pattern, def_lid in glossary_entries:
        if def_lid not in cleaned_bodies:
            continue
        checked_terms += 1
        def_idx = PATH_ORDER_IDS.index(def_lid)
        earliest_lid = None
        for lid in existing_ids:
            if re.search(pattern, cleaned_bodies[lid], flags=re.IGNORECASE):
                earliest_lid = lid
                break
        if earliest_lid is None:
            errors.append(
                f"Glossary term '{raw_term}' (defined in {def_lid}) was not found in {def_lid} or any lesson"
            )
        else:
            earliest_idx = PATH_ORDER_IDS.index(earliest_lid)
            if earliest_idx < def_idx:
                errors.append(
                    f"Glossary term '{raw_term}' is used in {earliest_lid} BEFORE its defining lesson {def_lid}"
                )
    return errors, checked_terms


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify glossary term order and prerequisite order.")
    parser.add_argument("--plan", default=PLAN_PATH, help="Path to PLAN-batch-1.md")
    args = parser.parse_args()

    glossary_entries = parse_glossary()
    plan_errors = check_plan(args.plan, glossary_entries)
    lesson_errors, checked_terms = check_lessons(glossary_entries)

    all_errors = plan_errors + lesson_errors
    if all_errors:
        print(f"FAIL: {len(all_errors)} term-order / prerequisite error(s) found:")
        for e in all_errors:
            print(f"  - {e}")
        return 1

    lessons = discover_existing_lessons()
    print(
        f"OK: Verified {len(glossary_entries)} glossary terms ({checked_terms} active across {len(lessons)} lessons) "
        f"and PLAN-batch-1.md prerequisites with 0 violations."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
