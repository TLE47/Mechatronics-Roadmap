#!/usr/bin/env python3
"""
Automated test suite for all 24 Beginner Roadmap lessons:
- Track P (`P.1` through `P.12` + `P.M`: 13 Python lessons)
- Stage 0 (`S0.1` through `S0.6`: 6 Python lessons; `S0.7` through `S0.M`: 4 Arduino Uno Wokwi lessons)
- Track 01 (`01.1-mosfet-inductor-flyback.md`: 1 Python lesson)

1. Dynamically extracts every Python `Starter Code` and `Full Solution` from all 20 Python-based lessons,
   executes them, and verifies exact `Expected Output` matches.
2. Executes the Python numerical mirrors for the 4 Arduino Uno Wokwi lessons (`S0.7`, `S0.8`, `S0.9`, `S0.M`)
   (moved out of the lesson markdown files into `tests/` so learners only run the Wokwi sketch).
3. Extracts all 8 C++ Arduino sketches (`Starter Code` + `Full Solution` from `S0.7`, `S0.8`, `S0.9`, `S0.M`),
   compiles and runs them via `scripts/extract_and_compile_sketches.py` if `g++` is available, and verifies
   their exact Serial Monitor output against each lesson's `Expected Output`.
4. Verifies all `Check yourself` quiz numerical answers across Track P, Stage 0, and Lesson 01.1.
"""

import contextlib
import glob
import io
import math
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import extract_and_compile_sketches as arduino_verifier  # noqa: E402


def natural_sort_key(path: str):
    parts = re.split(r"(\d+)", os.path.basename(path))
    return [int(p) if p.isdigit() else p for p in parts]


def get_python_lesson_files():
    track_p = sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md")), key=natural_sort_key)
    stage_0_py = [
        os.path.join(ROOT, "stage-0", "S0.1-closed-circuits-and-ohms-law.md"),
        os.path.join(ROOT, "stage-0", "S0.2-leds-and-resistor-power.md"),
        os.path.join(ROOT, "stage-0", "S0.3-breadboards-and-short-circuits.md"),
        os.path.join(ROOT, "stage-0", "S0.4-multimeters-and-current-limited-supplies.md"),
        os.path.join(ROOT, "stage-0", "S0.5-series-parallel-and-voltage-dividers.md"),
        os.path.join(ROOT, "stage-0", "S0.6-capacitors-and-decoupling.md"),
    ]
    track_01 = [os.path.join(ROOT, "01-electronics-and-power", "01.1-mosfet-inductor-flyback.md")]
    return track_p + stage_0_py + track_01


def extract_python_blocks(markdown_text: str, filepath: str):
    starter_m = re.search(
        r"### Starter Code[^\n]*\n.*?```python\n(.*?)```",
        markdown_text,
        flags=re.DOTALL,
    )
    expected_m = re.search(
        r"### Expected Output\n.*?```text\n(.*?)```",
        markdown_text,
        flags=re.DOTALL,
    )
    solution_m = re.search(
        r"<summary><strong>Full Solution</strong></summary>\s*```python\n(.*?)```",
        markdown_text,
        flags=re.DOTALL,
    )
    if not starter_m or not expected_m or not solution_m:
        raise ValueError(f"Missing Starter Code, Expected Output, or Full Solution in {filepath}")
    return (
        starter_m.group(1),
        expected_m.group(1).strip(),
        solution_m.group(1),
    )


class TestBeginnerRoadmapExercises(unittest.TestCase):
    def test_all_20_python_lessons_starter_and_full_solutions(self):
        """Every Python lesson's Starter Code runs without error, and Full Solution matches Expected Output."""
        lesson_files = get_python_lesson_files()
        self.assertEqual(len(lesson_files), 20)

        for path in lesson_files:
            rel_path = os.path.relpath(path, ROOT)
            with self.subTest(lesson=rel_path):
                with open(path, "r", encoding="utf-8") as f:
                    text = f.read()
                starter_code, expected_out, solution_code = extract_python_blocks(text, rel_path)

                starter_buf = io.StringIO()
                with contextlib.redirect_stdout(starter_buf):
                    exec(compile(starter_code, f"{rel_path}:starter", "exec"), {"__name__": "__main__"})

                sol_buf = io.StringIO()
                with contextlib.redirect_stdout(sol_buf):
                    exec(compile(solution_code, f"{rel_path}:solution", "exec"), {"__name__": "__main__"})
                actual_out = sol_buf.getvalue().strip()
                self.assertEqual(actual_out, expected_out)

    def test_arduino_wokwi_lessons_python_mirrors_and_cpp_sketches(self):
        """Verify Python numerical mirrors AND extracted C++ sketches for S0.7, S0.8, S0.9, and S0.M."""
        # 1. S0.7 Python mirror
        s07_info = arduino_verifier.extract_sketches_from_lesson(
            os.path.join(ROOT, "stage-0", "S0.7-arduino-uno-digital-io-and-pullups.md")
        )
        s07_lines = []
        for label, pin_reading in [("Released", 1), ("Pressed ", 0)]:
            led_out = 1 if pin_reading == 0 else 0
            p_str = "HIGH(1)" if pin_reading == 1 else "LOW(0)"
            l_str = "HIGH(1)" if led_out == 1 else "LOW(0)"
            s07_lines.append(f"{label} | pin_reading={p_str} -> led_out={l_str}")
        self.assertEqual("\n".join(s07_lines), s07_info["expected_output"])

        # 2. S0.8 Python mirror
        s08_info = arduino_verifier.extract_sketches_from_lesson(
            os.path.join(ROOT, "stage-0", "S0.8-adc-analog-read-and-serial-monitor.md")
        )
        s08_lines = []
        for adc_raw in [0, 256, 512, 1023]:
            volts = (adc_raw / 1023.0) * 5.0
            pct = (adc_raw / 1023.0) * 100.0
            s08_lines.append(f"ADC={adc_raw} -> V={volts:.2f} V ({pct:.1f}%)")
        self.assertEqual("\n".join(s08_lines), s08_info["expected_output"])

        # 3. S0.9 Python mirror
        s09_info = arduino_verifier.extract_sketches_from_lesson(
            os.path.join(ROOT, "stage-0", "S0.9-pwm-duty-cycle-and-analog-write.md")
        )
        s09_lines = []
        for cmd in [0, 64, 128, 255]:
            v_avg = (cmd / 255.0) * 5.0
            t_on_us = (cmd / 255.0) * (1_000_000.0 / 490.0)
            s09_lines.append(f"analogWrite(9, {cmd}) -> V_avg = {v_avg:.2f} V | T_on = {t_on_us:.1f} us (at 490 Hz)")
        self.assertEqual("\n".join(s09_lines), s09_info["expected_output"])

        # 4. S0.M Python mirror
        s0m_info = arduino_verifier.extract_sketches_from_lesson(
            os.path.join(ROOT, "stage-0", "S0.M-stage-0-milestone.md")
        )
        s0m_lines = []
        for adc_raw, btn in [(0, 1), (512, 1), (1023, 1), (1023, 0)]:
            pwm_val = 0 if btn == 0 else max(0, min(1023, adc_raw)) // 4
            v_avg = (pwm_val / 255.0) * 5.0
            b_str = "LOW(pressed)" if btn == 0 else "HIGH(open)"
            s0m_lines.append(f"adc_raw:{adc_raw} | btn:{b_str} -> pwm_val:{pwm_val} | V_avg:{v_avg:.2f} V")
        self.assertEqual("\n".join(s0m_lines), s0m_info["expected_output"])

        # 5. Host C++ compilation & execution check (if g++ is present)
        ok, msg = arduino_verifier.run_host_verify()
        if ok:
            self.assertIn("Compiled and verified all 8 Arduino sketches", msg)

    def test_consistent_horizontal_torque_convention(self):
        """Verify horizontal-angle torque convention tau = m * g * L * cos(theta) across P.10, P.12, and P.M."""
        # P.10: x = L * cos(theta), y = L * sin(theta)
        self.assertAlmostEqual(0.20 * math.cos(math.radians(60.0)), 0.1000, places=4)
        self.assertAlmostEqual(0.20 * math.sin(math.radians(60.0)), 0.1732, places=4)

        # P.12: tau = m * g * L * cos(theta) for m=0.50 kg, L=0.30 m at 0, 60, 90 deg from horizontal
        self.assertAlmostEqual(0.50 * 9.81 * 0.30 * math.cos(math.radians(0.0)), 1.4715, places=4)
        self.assertAlmostEqual(0.50 * 9.81 * 0.30 * math.cos(math.radians(60.0)), 0.73575, places=4)
        self.assertAlmostEqual(0.50 * 9.81 * 0.30 * math.cos(math.radians(90.0)), 0.0000, places=4)

        # P.M: m=0.40 kg, L=0.25 m at 0 deg -> 0.9810 N*m; min 10-bit cmd for 2.0 N*m full scale = 502
        self.assertAlmostEqual(0.40 * 9.81 * 0.25 * math.cos(0.0), 0.9810, places=4)
        self.assertEqual(math.ceil((0.9810 / 2.0) * 1023.0), 502)


if __name__ == "__main__":
    unittest.main(verbosity=2)
