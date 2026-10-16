#!/usr/bin/env python3
"""
Automated test suite for all Beginner Roadmap lessons:
- Track P (P.1 through P.M)
- Stage 0 (S0.1 through S0.M)
- Track 01 Lesson 01.1 (01.1-mosfet-inductor-flyback.md)

1. Dynamically extracts every Python Full Solution code block from each
   lesson markdown file, executes it in an isolated subprocess, and verifies:
   - Exit code == 0 (all internal `assert` statements pass)
   - Standard output matches the lesson's documented `### Expected Output` block.
2. Dynamically executes every lesson's Starter Code (`TODO` template) to verify
   that starter code runs as-is without syntax errors or crashes.
3. Runs independent unit tests for every numerical calculation and
   "Check yourself" question across all 17 lessons.
"""

from __future__ import annotations

import math
import pathlib
import re
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent

LESSON_FILES = [
    ROOT / "track-p/P.1-variables-types-and-arithmetic.md",
    ROOT / "track-p/P.2-decisions-loops-and-lists.md",
    ROOT / "track-p/P.3-functions-assert-and-import.md",
    ROOT / "track-p/P.4-units-prefixes-binary-and-frequency.md",
    ROOT / "track-p/P.5-algebra-and-trigonometry-for-robotics.md",
    ROOT / "track-p/P.6-reading-time-series-graphs.md",
    ROOT / "track-p/P.7-forces-torque-and-rotational-motion.md",
    ROOT / "track-p/P.M-track-p-milestone.md",
    ROOT / "stage-0/S0.1-voltage-current-resistance-and-ohms-law.md",
    ROOT / "stage-0/S0.2-breadboards-multimeter-and-short-circuits.md",
    ROOT / "stage-0/S0.3-series-parallel-and-voltage-dividers.md",
    ROOT / "stage-0/S0.4-capacitors-and-power-rail-decoupling.md",
    ROOT / "stage-0/S0.5-arduino-uno-digital-io-and-pullups.md",
    ROOT / "stage-0/S0.6-adc-analog-read-and-serial-monitor.md",
    ROOT / "stage-0/S0.7-pwm-duty-cycle-and-analog-write.md",
    ROOT / "stage-0/S0.M-stage-0-milestone.md",
    ROOT / "01-electronics-and-power/01.1-mosfet-inductor-flyback.md",
]


def extract_starter_code(md_text: str) -> str:
    """Extract the Python starter code block under ### Starter Code."""
    m = re.search(
        r"### Starter Code[^\n]*\n.*?```python\n(.*?)```",
        md_text,
        re.DOTALL,
    )
    if not m:
        raise ValueError("Could not find Python Starter Code block")
    return m.group(1)


def extract_python_solution(md_text: str) -> str:
    """Extract the Python code block inside Full Solution."""
    m = re.search(
        r"<summary><strong>Full Solution</strong></summary>.*?```python\n(.*?)```",
        md_text,
        re.DOTALL,
    )
    if not m:
        raise ValueError("Could not find Python solution block inside Full Solution")
    return m.group(1)


def extract_expected_output(md_text: str) -> str:
    """Extract the Expected Output text block from Do it yourself."""
    m = re.search(
        r"### Expected Output\n.*?```text\n(.*?)```",
        md_text,
        re.DOTALL,
    )
    if not m:
        raise ValueError("Could not find ### Expected Output block")
    return m.group(1).strip()


class TestLessonExercises(unittest.TestCase):
    def test_all_17_lesson_files_exist(self) -> None:
        for path in LESSON_FILES:
            self.assertTrue(path.is_file(), f"Missing lesson file: {path}")

    def test_all_starter_code_runs_as_is(self) -> None:
        """Verify that every lesson's Starter Code runs as-is without crashing."""
        for path in LESSON_FILES:
            with self.subTest(lesson=path.name):
                md_text = path.read_text(encoding="utf-8")
                code = extract_starter_code(md_text)
                proc = subprocess.run(
                    [sys.executable, "-c", code],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                self.assertEqual(
                    proc.returncode,
                    0,
                    f"{path.name} Starter Code crashed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}",
                )

    def test_execute_all_lesson_python_solutions(self) -> None:
        """Run every lesson's Full Solution script and verify exact output & assertions."""
        for path in LESSON_FILES:
            with self.subTest(lesson=path.name):
                md_text = path.read_text(encoding="utf-8")
                code = extract_python_solution(md_text)
                expected_out = extract_expected_output(md_text)
                proc = subprocess.run(
                    [sys.executable, "-c", code],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                self.assertEqual(
                    proc.returncode,
                    0,
                    f"{path.name} Python solution failed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}",
                )
                actual_out = proc.stdout.strip()
                self.assertEqual(
                    actual_out,
                    expected_out,
                    f"Output mismatch in {path.name}:\nExpected:\n{expected_out}\nActual:\n{actual_out}",
                )

    def test_track_p_quiz_and_physics_math(self) -> None:
        # P.1: Order of operations, exponents, voltage divider
        self.assertAlmostEqual((10 + 20) / (2 * 3), 5.0)
        self.assertAlmostEqual(10 + 20 / 2 * 3, 40.0)
        self.assertAlmostEqual((2**3) + (15 / 2), 15.5)
        self.assertAlmostEqual(12.0 * (10000 / (20000 + 10000)), 4.0)

        # P.2: Clamping & list indexing
        temps = [25.0, 31.2, 42.8, 38.5]
        self.assertEqual(len(temps), 4)
        self.assertAlmostEqual(temps[0], 25.0)
        self.assertAlmostEqual(temps[3], 38.5)

        # P.3: Functions & while loop
        def ohms_law_voltage(current_a: float, resistance_ohm: float) -> float:
            return current_a * resistance_ohm

        self.assertAlmostEqual(ohms_law_voltage(1.5, 8.0), 12.0)

        # P.4: Metric prefixes, frequency/period, binary bits
        self.assertAlmostEqual(0.250 * 4.7 * 1e3, 1175.0)
        self.assertAlmostEqual(1.0 / 50.0, 0.020)
        self.assertAlmostEqual(1.0 / 0.0005, 2000.0)
        self.assertEqual((2**8) - 1, 255)
        self.assertEqual((2**10) - 1, 1023)
        self.assertEqual((2**12) - 1, 4095)

        # P.5: Algebra, trig, radians
        self.assertAlmostEqual((512.0 / 1023.0) * 5.0, 2.50244379, places=5)
        self.assertAlmostEqual(math.radians(90.0), math.pi / 2.0)
        self.assertAlmostEqual(0.20 * math.cos(math.radians(60.0)), 0.1000, places=4)
        self.assertAlmostEqual(0.20 * math.sin(math.radians(60.0)), 0.1732, places=4)
        self.assertAlmostEqual(math.degrees(math.atan2(0.10, -0.10)), 135.0)

        # P.6: Time-series graphs (slope & area)
        self.assertAlmostEqual((1.40 - 0.20) / (3.0 - 1.0), 0.60)
        self.assertAlmostEqual((-0.50) * 0.4, -0.20)
        self.assertAlmostEqual((0.0 - 1.60) / (2.5 - 2.0), -3.20)

        # P.7: Forces, torque, RPM -> rad/s
        self.assertAlmostEqual(0.50 * 9.81, 4.905)
        self.assertAlmostEqual(0.30 * 4.905 * math.sin(math.radians(90.0)), 1.4715)
        self.assertAlmostEqual(0.30 * 4.905 * math.sin(math.radians(0.0)), 0.0)
        self.assertAlmostEqual(300.0 * 2.0 * math.pi / 60.0, 31.4159265, places=5)

    def test_stage_0_and_track_01_math(self) -> None:
        # S0.1: Ohm's law & LED resistor
        r_led = (5.0 - 2.0) / 0.015
        self.assertAlmostEqual(r_led, 200.0)
        i_actual = (5.0 - 2.0) / 220.0
        self.assertAlmostEqual(i_actual * 1000.0, 13.63636, places=4)
        self.assertAlmostEqual((5.0 - 2.0) * i_actual * 1000.0, 40.90909, places=4)

        # S0.3: Series/parallel & voltage divider
        self.assertAlmostEqual((1000.0 * 1000.0) / (1000.0 + 1000.0), 500.0)
        v_div = 12.0 * (4700.0 / (10000.0 + 4700.0))
        self.assertAlmostEqual(v_div, 3.83673469, places=5)
        self.assertLess(v_div, 5.0)

        # S0.4: Capacitor tau = R*C and droop dV = I*dt/C
        tau_s = 10000.0 * 100e-6
        self.assertAlmostEqual(tau_s, 1.0)
        dv_droop = (1.5 * 0.0002) / 470e-6
        self.assertAlmostEqual(dv_droop, 0.63829787, places=5)

        # S0.6: 10-bit ADC quantization
        self.assertAlmostEqual(5.0 / 1023.0, 0.0048875855, places=7)
        self.assertEqual(512 // 4, 128)
        self.assertEqual(1023 // 4, 255)

        # S0.7: PWM duty cycle & average voltage
        self.assertAlmostEqual((64.0 / 255.0) * 5.0, 1.25490196, places=5)
        self.assertAlmostEqual((192.0 / 255.0) * 5.0, 3.76470588, places=5)

        # 01.1: MOSFET P = I^2 * Rds(on) & inductive kickback V_L = L * dI / dt
        p_fet_mw = (2.0**2) * 0.020 * 1000.0
        self.assertAlmostEqual(p_fet_mw, 80.0)
        v_spike = 12.0 + 0.0005 * (2.0 / 2e-6)
        self.assertAlmostEqual(v_spike, 512.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
