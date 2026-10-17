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
"""

import argparse
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


def run_host_verify() -> tuple[bool, str]:
    gpp = shutil.which("g++")
    if not gpp:
        return False, "g++ not installed in container"
    include_flags = cxx_include_flags(gpp)

    with tempfile.TemporaryDirectory() as tmpdir:
        for path in ARDUINO_LESSON_FILES:
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
    return True, f"Compiled and verified all {len(ARDUINO_LESSON_FILES) * 2} Arduino sketches (Starter + Full Solution) with g++"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--extract-dir", help="Directory to write extracted .ino sketches")
    parser.add_argument("--compile-arduino-cli", action="store_true", help="Compile all sketches with arduino-cli for arduino:avr:uno")
    parser.add_argument("--host-verify", action="store_true", help="Compile and run all sketches on host using g++ mock")
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
            for name, sdir in written:
                print(f"Compiling {name} for arduino:avr:uno ...")
                subprocess.run([cli, "compile", "--fqbn", "arduino:avr:uno", sdir], check=True)
        print(f"OK: Compiled all {len(written)} sketches with arduino-cli for arduino:avr:uno.")

    if args.host_verify:
        ok, msg = run_host_verify()
        print(msg)


if __name__ == "__main__":
    main()
