#!/usr/bin/env python3
"""run_all_labs.py — Master runner for all Python & C++20 reference simulations (Labs 00–06).

Exit-code family: typed (0 = all labs pass, 1 = lab failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

VERSION = "1.0.0"

PYTHON_LABS = [
    ("00-foundations", "00-foundations/lab/lab00_two_mass_and_so3.py"),
    ("01-electronics-and-power", "01-electronics-and-power/lab/lab01_power_and_afe.py"),
    ("02-mechanics-kinematics-dynamics", "02-mechanics-kinematics-dynamics/lab/lab02_poe_and_rnea.py"),
    ("03-sensors-and-actuators", "03-sensors-and-actuators/lab/lab03_foc_and_metrology.py"),
    ("05-control-and-estimation", "05-control-and-estimation/lab/lab05_eskf_mpc_and_cbf.py"),
    ("06-robotics-and-autonomy", "06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py"),
    ("07-systems-hil-and-production", "07-systems-hil-and-production/lab/lab07_sysid_hil_and_sto.py"),
    ("08-capstone-models", "08-capstone-projects/models/validate_models.py"),
]

CPP_LAB = ("04-embedded-and-realtime", "04-embedded-and-realtime/lab/lab04_realtime_embedded.cpp")


def find_cpp_cmd(cpp_source: Path, out_bin: Path) -> list[str]:
    cxx = os.environ.get("CXX") or shutil.which("clang++") or shutil.which("g++")
    if not cxx:
        raise RuntimeError("No C++20 compiler (clang++ or g++) found on PATH")
    cmd = [cxx, "-std=c++20", "-O3", "-Wall", "-Wextra", "-Werror", "-pthread"]
    # On macOS CommandLineTools, add explicit SDK C++ header path if present
    macos_cxx_inc = Path("/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1")
    if sys.platform == "darwin" and macos_cxx_inc.is_dir():
        cmd.extend(["-isystem", str(macos_cxx_inc)])
    cmd.extend([str(cpp_source), "-o", str(out_bin)])
    return cmd


def run_suite(repo_root: Path) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    all_ok = True

    for name, rel_path in PYTHON_LABS:
        script_path = repo_root / rel_path
        proc = subprocess.run(
            [sys.executable, str(script_path), "--json"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        ok = proc.returncode == 0
        payload: dict[str, Any] = {"lab": name, "ok": ok, "returncode": proc.returncode}
        if proc.stdout.strip():
            try:
                payload.update(json.loads(proc.stdout.strip().splitlines()[-1]))
            except json.JSONDecodeError:
                payload["raw_stdout"] = proc.stdout.strip()
        if not ok:
            all_ok = False
            payload["stderr"] = proc.stderr.strip()
        results.append(payload)

    # Compile and execute Lab 04 C++20 suite
    cpp_name, cpp_rel = CPP_LAB
    cpp_src = repo_root / cpp_rel
    with tempfile.TemporaryDirectory() as tmpdir:
        bin_path = Path(tmpdir) / "lab04_rt_test"
        compile_cmd = find_cpp_cmd(cpp_src, bin_path)
        comp = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=30, check=False)
        if comp.returncode != 0:
            all_ok = False
            results.append(
                {
                    "lab": cpp_name,
                    "ok": False,
                    "stage": "compile",
                    "stderr": comp.stderr.strip(),
                }
            )
        else:
            run_proc = subprocess.run(
                [str(bin_path), "--json"],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            ok = run_proc.returncode == 0
            if not ok:
                all_ok = False
            cpp_payload: dict[str, Any] = {"lab": cpp_name, "ok": ok, "returncode": run_proc.returncode}
            if run_proc.stdout.strip():
                try:
                    cpp_payload.update(json.loads(run_proc.stdout.strip().splitlines()[-1]))
                except json.JSONDecodeError:
                    cpp_payload["raw_stdout"] = run_proc.stdout.strip()
            results.append(cpp_payload)

    results.sort(key=lambda item: str(item.get("lab", "")))
    return {"ok": all_ok, "total_labs": len(results), "results": results}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="run_all_labs.py",
        description=(
            "Compile and execute all Python and C++20 reference simulations (Labs 00-06).\n"
            "Exit-code family: typed (0 = pass, 1 = lab failure, 2 = usage error)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-V", "--version", action="version", version=f"%(prog)s {VERSION}")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress non-error output")
    parser.add_argument("--verbose", action="store_true", help="Print detailed metrics per lab")
    parser.add_argument("--json", action="store_true", help="Emit clean JSON report to stdout")
    parser.add_argument("--no-input", action="store_true", help="Disable interactive prompts")
    parser.add_argument("--dry-run", action="store_true", help="Run verification without side effects")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Path to mechatronics-roadmap root",
    )
    args = parser.parse_args(argv)

    if not args.root.is_dir():
        sys.stderr.write(f"error: root directory not found: {args.root}\n")
        return 2

    report = run_suite(args.root)
    if args.json:
        sys.stdout.write(json.dumps(report, indent=2) + "\n")
    elif not args.quiet:
        status = "PASS" if report["ok"] else "FAIL"
        sys.stdout.write(f"[{status}] executed {report['total_labs']} lab suites (Python + C++20)\n")
        for r in report["results"]:
            tag = "OK  " if r.get("ok") else "FAIL"
            sys.stdout.write(f"  [{tag}] {r['lab']}\n")
            if not r.get("ok") and "stderr" in r:
                sys.stderr.write(f"{r['stderr']}\n")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
