#!/usr/bin/env python3
"""Run every exercise package's three-way check.

An exercise is only delivered when all four of these hold, and this script is what proves it:

  1. the reference solution passes the behaviour tests *and* the transfer tests;
  2. the starter fails, for the stated reason (a `NotImplementedError`, not an import error);
  3. every planted fault fails at least the test that names it (see `exercise.json`);
  4. a print-only submission passes nothing, however right its printed numbers are.

Rules for the packages themselves, checked here too: an exercise directory must carry
`exercise.json`, a `starter.py`, a `solution.py` and the test files its manifest names, and the
module it belongs to must exist. A package that skips one of these is a broken promise, not a
smaller exercise.

Usage
    python3 scripts/run_exercise.py                 # every package
    python3 scripts/run_exercise.py --only 02-mechanics.T2.02a -v
    python3 scripts/run_exercise.py --json
    python3 scripts/run_exercise.py --jobs 4        # default: one per performance core, max 8
    python3 scripts/run_exercise.py --report-file /tmp/run-exercise.json   # machine-readable copy

A package is an independent unit - its checks spawn interpreters and write nothing outside a temp
dir - so packages are checked in parallel worker processes and reported in package order. Everything
inside one package, and every verdict, is what a serial run produces: `--jobs 1` is the old path.
"""

import concurrent.futures
import functools
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXERCISES = os.path.join(ROOT, "exercises")
PLANT_DIR = os.path.join(ROOT, "resources", "plants")

if os.path.dirname(os.path.abspath(__file__)) not in sys.path:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import exercise_bundle  # noqa: E402  (path set above, on purpose)


def package_dirs():
    if not os.path.isdir(EXERCISES):
        return []
    return sorted(
        os.path.join(EXERCISES, name)
        for name in os.listdir(EXERCISES)
        if os.path.isfile(os.path.join(EXERCISES, name, "exercise.json"))
    )


def load_manifest(directory):
    with open(os.path.join(directory, "exercise.json"), "r", encoding="utf-8") as handle:
        return json.load(handle)


def run(target, test_id, directory):
    """Run one unittest target against one submission file; return (passed, output)."""
    env = dict(os.environ)
    env["EXERCISE_TARGET"] = target
    env["PYTHONPATH"] = os.pathsep.join(
        [directory, PLANT_DIR] + ([env["PYTHONPATH"]] if env.get("PYTHONPATH") else [])
    )
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", test_id],
        cwd=directory,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
    )
    return proc.returncode == 0, proc.stdout


def check_package(directory, verbose=False):
    """Return a dict {ok, id, checks: [{name, ok, detail}], lines: [...]}.

    The per-check lines are *collected*, not printed: this function may run in a worker process,
    where printing would interleave with other packages. `main` prints them in package order.
    """
    manifest = load_manifest(directory)
    ex_id = manifest["id"]
    checks = []
    lines = []

    def record(name, ok, detail=""):
        checks.append({"name": name, "ok": ok, "detail": detail})
        if verbose:
            lines.append(("  PASS  " if ok else "  FAIL  ") + name
                         + (("  " + detail) if detail and not ok else ""))

    # Package shape first: a missing file fails the package before anything runs.
    required = ["starter.py", "solution.py", "harness.py"] + list(manifest["checks"].values())
    missing = [name for name in required if not os.path.isfile(os.path.join(directory, name))]
    module_path = os.path.join(ROOT, manifest["module"])
    record("package files", not missing, "missing: " + ", ".join(missing) if missing else "")
    record("module exists", os.path.isfile(module_path), manifest["module"])
    if missing or not os.path.isfile(module_path):
        return {"id": ex_id, "ok": False, "checks": checks, "lines": lines}

    solution = os.path.join(directory, "solution.py")
    for label, filename in manifest["checks"].items():
        test_id = filename[:-3] if filename.endswith(".py") else filename
        ok, output = run(solution, test_id, directory)
        record("solution passes " + label, ok, output.strip().splitlines()[-1] if output.strip() else "")

    starter_ok, starter_out = run(os.path.join(directory, "starter.py"), manifest["checks"]["behaviour"], directory)
    record(
        "starter fails behaviour",
        not starter_ok and "NotImplementedError" in starter_out,
        "starter must fail on a TODO hole (NotImplementedError), not on an import error",
    )

    for fault, test_ids in manifest["faults"].items():
        path = os.path.join(directory, "faults", fault + ".py")
        if not os.path.isfile(path):
            record("fault " + fault + " is planted", False, "missing fault file")
            continue
        for test_id in test_ids:
            ok, output = run(path, test_id, directory)
            broken_import = "ModuleNotFoundError" in output or "ImportError" in output
            record("fault " + fault + " fails " + test_id.split(".")[-1], not ok and not broken_import,
                   "a fault that cannot even import is not a fault under test" if broken_import
                   else "this fault passed the test that should catch it")

    # The workbench entry is the same flattened program this check runs, so a browser PASS cannot
    # be a different program from the one CI graded.
    ok, output = exercise_bundle.run_browser_program(directory, "solution", root=ROOT)
    record("workbench entry passes", ok and "SELF-CHECK PASS:" in output,
           "the flattened browser program did not print its PASS line")
    ok, output = exercise_bundle.run_browser_program(directory, "starter", root=ROOT)
    record("workbench entry starter fails", not ok and "NotImplementedError" in output,
           "the browser starter must fail on a TODO hole")

    cheat = manifest.get("cheat")
    if cheat:
        cheat_id = cheat["must_fail"]
        cheat_path = os.path.join(directory, cheat["file"])
        ok, _ = run(cheat_path, cheat_id, directory)
        record("print-only submission fails", not ok, "printed answers are not an implementation")

    return {"id": ex_id, "ok": all(c["ok"] for c in checks), "checks": checks, "lines": lines}


def default_jobs():
    """One worker per performance core, capped: each worker spawns interpreters of its own."""
    try:
        performance = int(subprocess.run(["sysctl", "-n", "hw.perflevel0.logicalcpu"],
                                         capture_output=True, text=True).stdout)
    except (OSError, ValueError):
        performance = 0
    return max(1, min(performance or os.cpu_count() or 1, 8))


def parse_report_file(argv):
    """`--report-file PATH` / `--report-file=PATH`, or None. The tests read this instead of
    re-running every package, so CI pays for the 48-package sweep once rather than twice."""
    for index, token in enumerate(argv):
        if token == "--report-file":
            if index + 1 >= len(argv):
                raise SystemExit("run_exercise.py: --report-file needs a path")
            return argv[index + 1]
        if token.startswith("--report-file="):
            return token.split("=", 1)[1]
    return None


def parse_jobs(argv):
    """`--jobs N` / `-j N`, or None for the default. A bad value is a usage error."""
    for index, token in enumerate(argv):
        if token in ("--jobs", "-j"):
            if index + 1 >= len(argv):
                raise SystemExit("run_exercise.py: %s needs a count" % token)
            try:
                jobs = int(argv[index + 1])
            except ValueError:
                raise SystemExit("run_exercise.py: %s needs an integer, not %r"
                                 % (token, argv[index + 1]))
            if jobs < 1:
                raise SystemExit("run_exercise.py: --jobs must be at least 1")
            return jobs
        if token.startswith("--jobs="):
            try:
                jobs = int(token.split("=", 1)[1])
            except ValueError:
                raise SystemExit("run_exercise.py: --jobs needs an integer, not %r"
                                 % token.split("=", 1)[1])
            if jobs < 1:
                raise SystemExit("run_exercise.py: --jobs must be at least 1")
            return jobs
    return None


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    only = None
    verbose = "--verbose" in argv or "-v" in argv
    as_json = "--json" in argv
    if "--only" in argv:
        only = argv[argv.index("--only") + 1]
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    jobs = parse_jobs(argv) or default_jobs()
    report_file = parse_report_file(argv)

    directories = package_dirs()
    if only:
        directories = [d for d in directories if os.path.basename(d) == only or load_manifest(d)["id"] == only]
        if not directories:
            print("no exercise package matches %r" % only, file=sys.stderr)
            return 2
    if not directories:
        print("no exercise packages found under exercises/", file=sys.stderr)
        return 1

    # A package is checked in one worker process: its checks spawn interpreters of their own and
    # write nothing outside a temp dir, so two packages cannot tread on each other. `map` keeps the
    # results in `directories` order, so the report reads the same at any job count.
    work = functools.partial(check_package, verbose=verbose and not as_json)
    if jobs == 1 or len(directories) == 1:
        results = [work(directory) for directory in directories]
    else:
        with concurrent.futures.ProcessPoolExecutor(max_workers=jobs) as pool:
            results = list(pool.map(work, directories))

    for directory, result in zip(directories, results):
        if not as_json:
            print("%s" % load_manifest(directory)["id"])
            for line in result["lines"]:
                print(line)
            failed = [c for c in result["checks"] if not c["ok"]]
            print("  %s (%d checks)" % ("OK" if result["ok"] else "FAILED: %d" % len(failed), len(result["checks"])))
            for check in failed:
                print("    - %s: %s" % (check["name"], check["detail"]))

    report = [{k: v for k, v in result.items() if k != "lines"} for result in results]
    if as_json:
        print(json.dumps(report, indent=2))
    if report_file:
        with open(report_file, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
            handle.write("\n")

    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
