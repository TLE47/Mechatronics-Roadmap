#!/usr/bin/env python3
"""
Extracts and verifies all Arduino Uno sketches (`Starter Code` and `Full Solution`)
from the Stage 0 microcontroller lessons:
- `stage-0/S0.7-arduino-uno-digital-io-and-pullups.md`
- `stage-0/S0.8-adc-analog-read-and-serial-monitor.md`
- `stage-0/S0.9-pwm-duty-cycle-and-analog-write.md`
- `stage-0/S0.M-stage-0-milestone.md`

Modes:
1. `--extract-dir <dir>`: Writes each sketch into `<dir>/<sketch_name>/<sketch_name>.ino`
   so `arduino-cli compile --fqbn arduino:avr:uno` can compile every sketch in CI.
2. `--compile-arduino-cli`: Runs `arduino-cli compile --fqbn arduino:avr:uno` on all 8 extracted sketches.
3. `--host-verify`: Compiles each `Full Solution` C++ sketch with `g++` (if installed) against a lightweight
   host mock of `Arduino.h` (`Serial`, `pinMode`, `digitalRead`, `digitalWrite`, `analogRead`, `analogWrite`, `delay`)
   and verifies that its `setup()` output matches the lesson's `### Expected Output`!
4. `--write-panel` / `--check-panel`: writes `app/src/data/boardBridges.json` - the lesson's own
   sketch text and the serial output CI proves for it - which the workbench's **Board** card renders.
   `--check-panel` is the drift gate: the page is the source, so a lesson that edits its sketch
   cannot leave the card showing an older one.
5. `--write-firmware` / `--check-firmware`: compiles each `Full Solution` for `arduino:avr:uno` and
   commits the machine code to `app/public/firmware/<id>.hex`, with `app/src/data/firmware.json`
   recording the hash of the sketch it was built from. The Board tab runs that hex in `avr8js`, so
   the program a learner watches is the program the page ships. `--check-firmware` is the gate: the
   sketch hash must match the page, and the hex must be the file the index hashes.
"""

from __future__ import annotations  # `str | None` annotations must import on Python 3.9, the macOS system interpreter

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ARDUINO_LESSON_FILES = [
    os.path.join(ROOT, "stage-0", "S0.7-arduino-uno-digital-io-and-pullups.md"),
    os.path.join(ROOT, "stage-0", "S0.8-adc-analog-read-and-serial-monitor.md"),
    os.path.join(ROOT, "stage-0", "S0.9-pwm-duty-cycle-and-analog-write.md"),
    os.path.join(ROOT, "stage-0", "S0.M-stage-0-milestone.md"),
    os.path.join(ROOT, "01-electronics-and-power", "01.2-h-bridge-and-stall-current.md"),
]

HOST_ARDUINO_MOCK_H = r"""
#include <cstdio>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <iomanip>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define A0 14

inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int digitalRead(int) { return HIGH; }
inline int analogRead(int) { return 0; }
inline void analogWrite(int, int) {}
inline void delay(unsigned long) {}

struct MockSerial {
    void begin(long) {}
    void print(const char* s) { std::cout << s; }
    void print(int v) { std::cout << v; }
    void print(float v, int digits = 2) {
        std::cout << std::fixed << std::setprecision(digits) << v;
    }
    void print(double v, int digits = 2) {
        std::cout << std::fixed << std::setprecision(digits) << v;
    }
    void println(const char* s) { std::cout << s << "\n"; }
    void println(int v) { std::cout << v << "\n"; }
    void println(float v, int digits = 2) {
        std::cout << std::fixed << std::setprecision(digits) << v << "\n";
    }
    void println(double v, int digits = 2) {
        std::cout << std::fixed << std::setprecision(digits) << v << "\n";
    }
} Serial;
"""


PANEL_REL = os.path.join("app", "src", "data", "boardBridges.json")
PANEL_SCHEMA = "mechalab.board-bridges/1"
FIRMWARE_DIR_REL = os.path.join("app", "public", "firmware")
FIRMWARE_INDEX_REL = os.path.join("app", "src", "data", "firmware.json")
FIRMWARE_SCHEMA = "mechalab.firmware/1"
FIRMWARE_FQBN = "arduino:avr:uno"


def lesson_title(filepath: str) -> str:
    """The page's own `# ` heading, so the card names the lesson the way the page does."""
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("# "):
                return line[2:].strip()
    raise ValueError(f"No `# ` heading in {filepath}")


def panel_document(root: str = ROOT) -> dict:
    """The Board card's data: every Arduino lesson's sketch and the serial CI proves for it.

    Deliberately generated rather than hand-written for the same reason `prose-index.json` is: the
    lesson page owns the sketch, and a copy maintained beside it drifts silently the first time a
    lesson edits its `Full Solution`.
    """
    bridges = []
    for path in ARDUINO_LESSON_FILES:
        info = extract_sketches_from_lesson(path)
        bridges.append(
            {
                "id": info["slug"],
                "title": lesson_title(path),
                "page": os.path.relpath(path, root).replace(os.sep, "/"),
                "expectedOutput": info["expected_output"],
                "starter": info["starter_cpp"].strip(),
                "solution": info["solution_cpp"].strip(),
            }
        )
    return {
        "schema": PANEL_SCHEMA,
        "generatedBy": "scripts/extract_and_compile_sketches.py",
        "bridges": bridges,
    }


def panel_text(root: str = ROOT) -> str:
    """The file exactly as it should be on disk: stable key order, two-space indent, one newline."""
    return json.dumps(panel_document(root), indent=2, ensure_ascii=False) + "\n"


def write_panel(path: str | None = None, root: str = ROOT) -> str:
    target = path or os.path.join(root, PANEL_REL)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(panel_text(root))
    return target


def check_panel(path: str | None = None, root: str = ROOT) -> list[str]:
    """Why the committed card data no longer matches the lesson pages (empty when it does)."""
    target = path or os.path.join(root, PANEL_REL)
    expected = panel_text(root)
    if not os.path.exists(target):
        return [f"{target} is missing - run `python3 scripts/extract_and_compile_sketches.py --write-panel`"]
    with open(target, "r", encoding="utf-8") as f:
        actual = f.read()
    if actual == expected:
        return []
    try:
        committed = json.loads(actual)
    except ValueError as error:
        return [f"{target} is not valid JSON: {error}"]
    wanted = json.loads(expected)
    problems = []
    if committed.get("schema") != wanted["schema"]:
        problems.append(f"schema is {committed.get('schema')!r}, expected {wanted['schema']!r}")
    old = {bridge.get("id"): bridge for bridge in committed.get("bridges", [])}
    for bridge in wanted["bridges"]:
        entry = old.get(bridge["id"])
        if entry is None:
            problems.append(f"{bridge['id']} is in the lesson but not in the card data")
            continue
        for field in ("title", "page", "expectedOutput", "starter", "solution"):
            if entry.get(field) != bridge[field]:
                problems.append(f"{bridge['id']}.{field} differs from {bridge['page']}")
    for missing in sorted(set(old) - {bridge["id"] for bridge in wanted["bridges"]}):
        problems.append(f"{missing} is in the card data but no lesson produces it")
    if not problems:
        problems.append("the document differs from the generated one (formatting or key order)")
    return problems


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _tool_version(argv: list[str]) -> str:
    """Provenance for the index: which compiler built these bytes (informational, not gated)."""
    try:
        run = subprocess.run(argv, capture_output=True, text=True)
    except OSError:
        return "unknown"
    first = (run.stdout or run.stderr).strip().splitlines()
    return first[0] if first else "unknown"


def firmware_document(root: str = ROOT) -> dict:
    """Every Arduino lesson's compiled `Full Solution`, with hashes the gates can check.

    The hex is committed rather than built in the browser: an AVR toolchain is far beyond this
    app's weight, and the program is the *reference* - an edit still runs on a board or in CI. What
    ties the committed bytes to the page is the sketch hash: CI cannot byte-compare a rebuild (a
    newer toolchain changes the machine code, not the behaviour), so `--check-firmware` proves the
    hex was built from this exact sketch text, and the Node suite proves it prints the lesson's serial.
    """
    cli = shutil.which("arduino-cli")
    if not cli:
        raise SystemExit("arduino-cli is required to build the firmware (`arduino-cli core install arduino:avr`)")

    sketches_out = os.path.join(root, FIRMWARE_DIR_REL)
    os.makedirs(sketches_out, exist_ok=True)
    entries = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for path in ARDUINO_LESSON_FILES:
            info = extract_sketches_from_lesson(path)
            sketch_dir = os.path.join(tmpdir, info["slug"])
            os.makedirs(sketch_dir, exist_ok=True)
            ino = os.path.join(sketch_dir, f"{info['slug']}.ino")
            with open(ino, "w", encoding="utf-8") as handle:
                handle.write(info["solution_cpp"])
            build_dir = os.path.join(sketch_dir, "build")
            run = subprocess.run(
                [cli, "compile", "--fqbn", FIRMWARE_FQBN, "--output-dir", build_dir, sketch_dir],
                capture_output=True,
                text=True,
            )
            if run.returncode != 0:
                raise SystemExit(f"arduino-cli failed on {info['slug']}:\n{run.stderr}")
            built = os.path.join(build_dir, f"{info['slug']}.ino.hex")
            with open(built, "r", encoding="utf-8") as handle:
                hex_text = handle.read()
            target = os.path.join(sketches_out, f"{info['slug']}.hex")
            with open(target, "w", encoding="utf-8") as handle:
                handle.write(hex_text)
            entries.append(
                {
                    "id": info["slug"],
                    "hex": f"{os.path.basename(FIRMWARE_DIR_REL)}/{info['slug']}.hex",
                    "sketchSha256": sha256_text(info["solution_cpp"]),
                    "hexSha256": sha256_text(hex_text),
                    "hexBytes": len(hex_text.encode("utf-8")),
                }
            )
    return {
        "schema": FIRMWARE_SCHEMA,
        "fqbn": FIRMWARE_FQBN,
        "generatedBy": "scripts/extract_and_compile_sketches.py --write-firmware",
        "toolchain": {
            "arduinoCli": _tool_version([cli, "version"]),
            "core": _tool_version([cli, "core", "list"]),
        },
        "sketches": entries,
    }


def write_firmware(root: str = ROOT) -> str:
    target = os.path.join(root, FIRMWARE_INDEX_REL)
    document = firmware_document(root)
    with open(target, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    return target


def check_firmware(root: str = ROOT) -> list[str]:
    """Why the committed firmware no longer matches the lessons (empty when it does).

    No compiler is needed, which is what makes this a gate a laptop and a runner can both run: the
    index carries the hash of the sketch each hex was built from, so a lesson edit is caught here,
    and the Node suite catches a hex that stops printing what the lesson says.
    """
    index_path = os.path.join(root, FIRMWARE_INDEX_REL)
    if not os.path.exists(index_path):
        return [f"{index_path} is missing - run `python3 scripts/extract_and_compile_sketches.py --write-firmware`"]
    with open(index_path, "r", encoding="utf-8") as handle:
        try:
            index = json.load(handle)
        except ValueError as error:
            return [f"{index_path} is not valid JSON: {error}"]
    if index.get("schema") != FIRMWARE_SCHEMA:
        return [f"firmware schema is {index.get('schema')!r}, expected {FIRMWARE_SCHEMA!r}"]

    entries = {entry.get("id"): entry for entry in index.get("sketches", [])}
    problems = []
    for path in ARDUINO_LESSON_FILES:
        info = extract_sketches_from_lesson(path)
        entry = entries.get(info["slug"])
        if entry is None:
            problems.append(f"{info['slug']} has no compiled firmware; the Board tab cannot run it")
            continue
        wanted = sha256_text(info["solution_cpp"])
        if entry.get("sketchSha256") != wanted:
            problems.append(
                f"{info['slug']} was built from a different sketch - {path} has changed since; "
                "rebuild with --write-firmware"
            )
        hex_path = os.path.join(root, "app", "public", entry.get("hex", ""))
        if not os.path.exists(hex_path):
            problems.append(f"{info['slug']} names {entry.get('hex')}, which is not on disk")
            continue
        with open(hex_path, "r", encoding="utf-8") as handle:
            hex_text = handle.read()
        if entry.get("hexSha256") != sha256_text(hex_text):
            problems.append(f"{entry.get('hex')} was edited after it was built; rebuild with --write-firmware")
        lines = [line for line in hex_text.splitlines() if line.strip()]
        if not lines or not lines[0].startswith(":") or not lines[-1].startswith(":00000001"):
            problems.append(f"{entry.get('hex')} is not an Intel HEX file (no record or no end record)")
    for extra in sorted(set(entries) - {extract_sketches_from_lesson(p)["slug"] for p in ARDUINO_LESSON_FILES}):
        problems.append(f"{extra} has firmware but no lesson page produces it")
    return problems


def extract_sketches_from_lesson(filepath: str) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    starter_m = re.search(
        r"### Starter Code[^\n]*\n.*?```cpp\n(.*?)```",
        text,
        flags=re.DOTALL,
    )
    expected_m = re.search(
        r"### Expected Output\n.*?```text\n(.*?)```",
        text,
        flags=re.DOTALL,
    )
    solution_m = re.search(
        r"<summary><strong>Full Solution</strong></summary>\s*```cpp\n(.*?)```",
        text,
        flags=re.DOTALL,
    )
    if not starter_m or not expected_m or not solution_m:
        raise ValueError(f"Missing cpp Starter Code, Expected Output, or Full Solution in {filepath}")

    lesson_slug = os.path.splitext(os.path.basename(filepath))[0].replace(".", "_")
    return {
        "filepath": filepath,
        "slug": lesson_slug,
        "starter_cpp": starter_m.group(1),
        "solution_cpp": solution_m.group(1),
        "expected_output": expected_m.group(1).strip(),
    }


def write_sketches_to_dir(out_dir: str) -> list[tuple[str, str]]:
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for path in ARDUINO_LESSON_FILES:
        info = extract_sketches_from_lesson(path)
        for kind, code in [("starter", info["starter_cpp"]), ("solution", info["solution_cpp"])]:
            sketch_name = f"{info['slug']}_{kind}"
            sketch_dir = os.path.join(out_dir, sketch_name)
            os.makedirs(sketch_dir, exist_ok=True)
            ino_path = os.path.join(sketch_dir, f"{sketch_name}.ino")
            with open(ino_path, "w", encoding="utf-8") as f:
                f.write(code)
            written.append((sketch_name, sketch_dir))
    return written


def _compiler_has_cstdio(compiler: str, extra_dir: str | None = None) -> bool:
    """True when `compiler` can see `<cstdio>` with the given include directory (or none)."""
    command = [compiler, "-std=c++17", "-fsyntax-only", "-x", "c++", "-"]
    if extra_dir:
        command[3:3] = ["-isystem", extra_dir]
    probe = subprocess.run(command, input="#include <cstdio>\nint main() { return 0; }\n",
                           capture_output=True, text=True)
    return probe.returncode == 0


def libcxx_search_dirs() -> list[str]:
    """Where a macOS SDK keeps its own copy of the C++ standard library headers."""
    dirs = []
    sdk = subprocess.run(["xcrun", "--show-sdk-path"], capture_output=True, text=True)
    if sdk.returncode == 0 and sdk.stdout.strip():
        dirs.append(os.path.join(sdk.stdout.strip(), "usr", "include", "c++", "v1"))
    dirs.append("/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1")
    return dirs


def cxx_include_flags(compiler: str, candidates: list[str] | None = None) -> list[str]:
    """Include flags `compiler` needs to find the C++ standard library, if any.

    Some Command Line Tools installs leave `<CLT>/usr/include/c++/v1` holding only
    `__cxx_version`, while the active SDK ships the real libc++ - so `<cstdio>` is missing
    even though the toolchain is otherwise complete (`fatal error: 'cstdio' file not found`).
    The SDK's own copy is added with `-isystem` only when a probe says the default search
    fails, so a healthy toolchain gets no extra flags and no behaviour change.
    """
    if _compiler_has_cstdio(compiler):
        return []
    for directory in (candidates if candidates is not None else libcxx_search_dirs()):
        if not os.path.isfile(os.path.join(directory, "cstdio")):
            continue
        if _compiler_has_cstdio(compiler, directory):
            return ["-isystem", directory]
    return []


def verify_one_sketch(path: str, gpp: str, include_flags: list[str], tmpdir: str) -> None:
    """Compile one lesson's starter and solution and run it; raises on any mismatch.

    Each lesson writes only its own `{slug}_*` files into the shared temp dir, so lessons can run
    side by side: the 10 lessons are g++ invocations, and 20 of them in series is the slowest thing
    the repository's own test suite does.
    """
    info = extract_sketches_from_lesson(path)
    # 1. Compile Starter Code with g++
    starter_src = os.path.join(tmpdir, f"{info['slug']}_starter.cpp")
    starter_bin = os.path.join(tmpdir, f"{info['slug']}_starter.out")
    with open(starter_src, "w", encoding="utf-8") as f:
        f.write(HOST_ARDUINO_MOCK_H + "\n" + info["starter_cpp"] + "\nint main() { setup(); return 0; }\n")
    subprocess.run([gpp, "-std=c++17", "-Wall", "-Wextra", *include_flags,
                    starter_src, "-o", starter_bin], check=True)

    # 2. Compile & Run Full Solution with g++ and verify Serial output matches Expected Output!
    sol_src = os.path.join(tmpdir, f"{info['slug']}_solution.cpp")
    sol_bin = os.path.join(tmpdir, f"{info['slug']}_solution.out")
    with open(sol_src, "w", encoding="utf-8") as f:
        f.write(HOST_ARDUINO_MOCK_H + "\n" + info["solution_cpp"] + "\nint main() { setup(); return 0; }\n")
    subprocess.run([gpp, "-std=c++17", "-Wall", "-Wextra", *include_flags,
                    sol_src, "-o", sol_bin], check=True)
    proc = subprocess.run([sol_bin], capture_output=True, text=True, check=True)
    actual = proc.stdout.strip()
    if actual != info["expected_output"]:
        raise AssertionError(
            f"C++ Serial output mismatch in {info['filepath']}:\n"
            f"Expected:\n{info['expected_output']}\nActual:\n{actual}"
        )


def run_host_verify() -> tuple[bool, str]:
    gpp = shutil.which("g++")
    if not gpp:
        return False, "g++ not installed in container"
    include_flags = cxx_include_flags(gpp)

    with tempfile.TemporaryDirectory() as tmpdir:
        work = [(path, gpp, include_flags, tmpdir) for path in ARDUINO_LESSON_FILES]
        workers = max(1, min(len(work), os.cpu_count() or 1, 8))
        failures = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(verify_one_sketch, *item): item[0] for item in work}
            for future, path in futures.items():
                try:
                    future.result()
                except Exception as exc:  # noqa: BLE001 - re-raised below, in lesson order
                    failures[path] = exc
        # The first failure in lesson order, so which lesson is reported cannot depend on timing.
        for path in ARDUINO_LESSON_FILES:
            if path in failures:
                raise failures[path]
    return True, f"Compiled and verified all {len(ARDUINO_LESSON_FILES) * 2} Arduino sketches (Starter + Full Solution) with g++"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--extract-dir", help="Directory to write extracted .ino sketches")
    parser.add_argument("--compile-arduino-cli", action="store_true", help="Compile all sketches with arduino-cli for arduino:avr:uno")
    parser.add_argument("--host-verify", action="store_true", help="Compile and run all sketches on host using g++ mock")
    parser.add_argument("--write-panel", nargs="?", const=PANEL_REL, default=None,
                        metavar="PATH", help="Write the Board card's generated data (default: app/src/data/boardBridges.json)")
    parser.add_argument("--check-panel", nargs="?", const=PANEL_REL, default=None,
                        metavar="PATH", help="Fail when that data no longer matches the lesson pages")
    parser.add_argument("--write-firmware", action="store_true",
                        help="Compile every Full Solution for arduino:avr:uno and write app/public/firmware + its index")
    parser.add_argument("--check-firmware", action="store_true",
                        help="Fail when the committed firmware or its index no longer matches the lessons")
    args = parser.parse_args()

    if args.extract_dir:
        written = write_sketches_to_dir(args.extract_dir)
        print(f"Extracted {len(written)} Arduino Uno sketches to {args.extract_dir}")

    if args.compile_arduino_cli:
        cli = shutil.which("arduino-cli")
        if not cli:
            print("ERROR: arduino-cli not found on PATH", file=sys.stderr)
            sys.exit(1)
        with tempfile.TemporaryDirectory() as tmpdir:
            written = write_sketches_to_dir(tmpdir)
            # One build alone, before the fan-out. Every sketch links against the compiled
            # arduino:avr core, and the first build of that archive is the one piece of state all
            # of them share: on a fresh runner with an empty cache, eight processes asking for it
            # at once produced a bare `collect2: error: ld returned 1 exit status` in CI. Building
            # a sketch first leaves the archive complete for the rest to read, and a broken
            # toolchain fails here with one message instead of eight.
            warm_dir = os.path.join(tmpdir, "core_warmup")
            os.makedirs(warm_dir, exist_ok=True)
            with open(os.path.join(warm_dir, "core_warmup.ino"), "w", encoding="utf-8") as handle:
                handle.write("void setup() {}\nvoid loop() {}\n")
            warmup = subprocess.run([cli, "compile", "--fqbn", "arduino:avr:uno", warm_dir],
                                    capture_output=True, text=True)
            if warmup.returncode != 0:
                print(f"arduino-cli could not build the arduino:avr core:\n{warmup.stderr}",
                      file=sys.stderr)
                raise SystemExit(warmup.returncode)
            # Each sketch is its own directory and its own arduino-cli process: ten cold CLI starts
            # in series is the slowest step of the firmware job, so they run side by side. Verdicts
            # are read back in sketch order, so a failure names the same sketch it would have.
            for name, _sdir in written:
                print(f"Compiling {name} for arduino:avr:uno ...")
            workers = max(1, min(len(written), os.cpu_count() or 1, 8))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                futures = [(name, pool.submit(subprocess.run,
                                              [cli, "compile", "--fqbn", "arduino:avr:uno", sdir],
                                              check=True, capture_output=True, text=True))
                           for name, sdir in written]
            for name, future in futures:
                failure = future.exception()
                if failure is not None:
                    print(f"arduino-cli failed on {name}:\n{getattr(failure, 'stderr', '')}",
                          file=sys.stderr)
                    raise failure
        print(f"OK: Compiled all {len(written)} sketches with arduino-cli for arduino:avr:uno.")

    if args.host_verify:
        ok, msg = run_host_verify()
        print(msg)

    if args.write_panel is not None:
        target = write_panel(args.write_panel)
        count = len(panel_document()["bridges"])
        print(f"Wrote {count} Board bridge(s) to {os.path.relpath(target, ROOT)}")

    if args.check_panel is not None:
        problems = check_panel(args.check_panel)
        if problems:
            print("Board card data is stale:", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
            print("\nRun `python3 scripts/extract_and_compile_sketches.py --write-panel` to regenerate.",
                  file=sys.stderr)
            raise SystemExit(1)
        print("OK: the Board card's data matches all lesson pages.")

    if args.write_firmware:
        target = write_firmware()
        count = len(firmware_document()["sketches"])
        print(f"Compiled {count} sketch(es) into app/public/firmware and wrote {os.path.relpath(target, ROOT)}")

    if args.check_firmware:
        problems = check_firmware()
        if problems:
            print("Committed firmware is stale:", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
            raise SystemExit(1)
        print("OK: every lesson's firmware was built from the sketch the page ships.")


if __name__ == "__main__":
    main()
