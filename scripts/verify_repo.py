#!/usr/bin/env python3
"""verify_repo.py — Automated integrity, link, and Mermaid validator for mechatronics-roadmap.

Exit-code family: typed (0 = all checks passed, 1 = validation findings, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
from pathlib import Path
from typing import Any

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

VERSION = "1.0.0"

EXPECTED_FILES = [
    "README.md",
    "00-foundations/README.md",
    "00-foundations/lab/lab00_two_mass_and_so3.py",
    "01-electronics-and-power/README.md",
    "01-electronics-and-power/lab/lab01_power_and_afe.py",
    "02-mechanics-kinematics-dynamics/README.md",
    "02-mechanics-kinematics-dynamics/lab/lab02_poe_and_rnea.py",
    "02-mechanics-kinematics-dynamics/cad/cad_parametric_parts.py",
    "02-mechanics-kinematics-dynamics/cad/validate_cad_parts.py",
    "02-mechanics-kinematics-dynamics/cad/notch_flexure_hinge.step",
    "02-mechanics-kinematics-dynamics/cad/notch_flexure_hinge.stl",
    "02-mechanics-kinematics-dynamics/cad/kelvin_kinematic_coupling.step",
    "02-mechanics-kinematics-dynamics/cad/kelvin_kinematic_coupling.stl",
    "02-mechanics-kinematics-dynamics/cad/cad_manifest.json",
    "03-sensors-and-actuators/README.md",
    "03-sensors-and-actuators/lab/lab03_foc_and_metrology.py",
    "04-embedded-and-realtime/README.md",
    "04-embedded-and-realtime/lab/lab04_realtime_embedded.cpp",
    "05-control-and-estimation/README.md",
    "05-control-and-estimation/lab/lab05_eskf_mpc_and_cbf.py",
    "06-robotics-and-autonomy/README.md",
    "06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py",
    "07-systems-hil-and-production/README.md",
    "07-systems-hil-and-production/lab/lab07_sysid_hil_and_sto.py",
    "08-capstone-projects/README.md",
    "08-capstone-projects/cad/qdd_planetary_carrier.step",
    "08-capstone-projects/cad/qdd_planetary_carrier.stl",
    "08-capstone-projects/eda-capstone1-foc-drive/generate_foc_pcb_and_bom.py",
    "08-capstone-projects/eda-capstone1-foc-drive/capstone1_foc_48v30a.net",
    "08-capstone-projects/eda-capstone1-foc-drive/capstone1_bom.csv",
    "08-capstone-projects/eda-capstone1-foc-drive/foc_thermal_and_bom.json",
    "08-capstone-projects/models/validate_models.py",
    "08-capstone-projects/models/capstone2-furuta-pendulum/furuta_pendulum.urdf",
    "08-capstone-projects/models/capstone2-furuta-pendulum/furuta_pendulum.xml",
    "08-capstone-projects/models/capstone3-6dof-arm/manipulator_6dof.urdf",
    "08-capstone-projects/models/capstone3-6dof-arm/manipulator_6dof.xml",
    "08-capstone-projects/models/capstone4-qdd-hopper/qdd_hopper_leg.urdf",
    "08-capstone-projects/models/capstone4-qdd-hopper/qdd_hopper_leg.xml",
    "resources/textbooks-and-papers.md",
    "resources/open-source-toolchains.md",
    "resources/lab-workbench-bom.md",
    "scripts/verify_repo.py",
    "scripts/run_all_labs.py",
    "web/index.html",
    ".github/workflows/ci.yml",
]

VALID_MERMAID_HEADERS = (
    "flowchart ",
    "graph ",
    "sequenceDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "journey",
    "classDiagram",
    "erDiagram",
    "gantt",
    "mindmap",
)

LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
FENCE_RE = re.compile(r"^```(\w*)\s*$", re.MULTILINE)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)


def slugify_heading(text: str) -> str:
    slug = text.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    return slug


def extract_anchors(md_text: str) -> set[str]:
    anchors: set[str] = set()
    for match in HEADING_RE.finditer(md_text):
        anchors.add(slugify_heading(match.group(2)))
    return anchors


def extract_mermaid_blocks(md_text: str) -> list[str]:
    blocks: list[str] = []
    in_mermaid = False
    current: list[str] = []
    for line in md_text.splitlines():
        stripped = line.strip()
        if not in_mermaid and stripped.startswith("```mermaid"):
            in_mermaid = True
            current = []
        elif in_mermaid and stripped == "```":
            in_mermaid = False
            blocks.append("\n".join(current))
        elif in_mermaid:
            current.append(line)
    return blocks


def verify_repository(repo_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    file_stats: list[dict[str, Any]] = []
    total_mermaid = 0
    total_links = 0
    total_lines = 0

    for rel in EXPECTED_FILES:
        fpath = repo_root / rel
        if not fpath.is_file():
            errors.append(f"Missing expected file: {rel}")

    md_files = sorted(repo_root.rglob("*.md"))
    anchors_cache: dict[Path, set[str]] = {}
    for md_path in md_files:
        anchors_cache[md_path.resolve()] = extract_anchors(md_path.read_text(encoding="utf-8"))

    for md_path in md_files:
        rel_path = md_path.relative_to(repo_root).as_posix()
        text = md_path.read_text(encoding="utf-8")
        lines = text.splitlines()
        total_lines += len(lines)

        fence_count = sum(1 for line in lines if line.strip().startswith("```"))
        if fence_count % 2 != 0:
            errors.append(f"{rel_path}: Unbalanced markdown code fences (count={fence_count})")

        # Math block delimiter linting ($$ ... $$ balanced)
        display_math_markers = text.count("$$")
        if display_math_markers % 2 != 0:
            errors.append(f"{rel_path}: Unbalanced display math '$$' delimiters (count={display_math_markers})")

        m_blocks = extract_mermaid_blocks(text)
        total_mermaid += len(m_blocks)
        if len(m_blocks) == 0 and rel_path != "resources/textbooks-and-papers.md":
            errors.append(f"{rel_path}: Expected at least 1 Mermaid diagram, found 0")

        for idx, block in enumerate(m_blocks, start=1):
            non_empty = [ln.strip() for ln in block.splitlines() if ln.strip()]
            if not non_empty:
                errors.append(f"{rel_path}: Mermaid block #{idx} is empty")
                continue
            first_line = non_empty[0]
            if not first_line.startswith(VALID_MERMAID_HEADERS):
                errors.append(
                    f"{rel_path}: Mermaid block #{idx} has unrecognized header: '{first_line}'"
                )

        file_link_count = 0
        for match in LINK_RE.finditer(text):
            target = match.group(2).strip()
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            file_link_count += 1
            total_links += 1
            if "#" in target:
                path_part, anchor_part = target.split("#", 1)
            else:
                path_part, anchor_part = target, ""

            target_path = (md_path.parent / path_part).resolve() if path_part else md_path.resolve()
            if not target_path.exists():
                errors.append(f"{rel_path}: Broken relative link '{target}'")
                continue
            if anchor_part and target_path in anchors_cache:
                if anchor_part.lower() not in anchors_cache[target_path]:
                    errors.append(
                        f"{rel_path}: Broken heading anchor '#{anchor_part}' in '{target}'"
                    )

        file_stats.append(
            {
                "file": rel_path,
                "lines": len(lines),
                "mermaid_diagrams": len(m_blocks),
                "internal_links": file_link_count,
            }
        )

    return {
        "ok": len(errors) == 0,
        "repo_root": str(repo_root.resolve()),
        "markdown_files": len(md_files),
        "total_lines": total_lines,
        "total_mermaid_diagrams": total_mermaid,
        "total_internal_links": total_links,
        "files": file_stats,
        "errors": errors,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="verify_repo.py",
        description=(
            "Validate all Markdown modules, Mermaid.js diagrams, relative links, "
            "and structural gates in the mechatronics-roadmap repository.\n"
            "Exit-code family: typed (0 = pass, 1 = findings, 2 = usage error)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-V", "--version", action="version", version=f"%(prog)s {VERSION}")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress non-error output")
    parser.add_argument("--verbose", action="store_true", help="Print per-file breakdown")
    parser.add_argument("--json", action="store_true", help="Emit clean JSON report to stdout")
    parser.add_argument("--no-input", action="store_true", help="Disable interactive input")
    parser.add_argument("--dry-run", action="store_true", help="Run read-only validation checks")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Path to mechatronics-roadmap root directory",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    repo_root: Path = args.root
    if not repo_root.is_dir():
        sys.stderr.write(f"error: repository root does not exist: {repo_root}\n")
        return 2

    report = verify_repository(repo_root)

    if args.json:
        sys.stdout.write(json.dumps(report, indent=2) + "\n")
    elif not args.quiet:
        status = "PASS" if report["ok"] else "FAIL"
        sys.stdout.write(
            f"[{status}] files={report['markdown_files']} "
            f"lines={report['total_lines']} "
            f"mermaid={report['total_mermaid_diagrams']} "
            f"links={report['total_internal_links']} "
            f"errors={len(report['errors'])}\n"
        )
        if args.verbose:
            for item in report["files"]:
                sys.stdout.write(
                    f"  {item['file']:<46} "
                    f"lines={item['lines']:<4} "
                    f"mermaid={item['mermaid_diagrams']:<2} "
                    f"links={item['internal_links']}\n"
                )
        for err in report["errors"]:
            sys.stderr.write(f"ERROR: {err}\n")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
