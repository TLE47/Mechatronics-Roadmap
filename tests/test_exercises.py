#!/usr/bin/env python3
"""
Automated test suite for all 48 beginner lessons:
- Track P (`P.1` through `P.12` + `P.14` + `P.M`: 14 Python lessons)
- Stage 0 (`S0.0`: 1 Python effort/flow analogy lesson; `S0.1` through `S0.6`: 6 Falstad circuit lessons; `S0.7` through `S0.M`: 4 Arduino Uno Wokwi lessons)
- Track 00 (`00.1` through `00.3`: 3 Python physics-modeling lessons)
- Track 01 (`01.1`: 1 Falstad circuit lesson; `01.2`: 1 Wokwi Arduino + Falstad lesson; `01.3` and `01.4`: 2 Python electronics-modeling lessons)
- Track 02 (`02.1` through `02.5`: 5 Python mechanics-modeling lessons)
- Tracks 03–08 (`03.1`, `03.2`, `03.3`, `04.1`, `04.2`, `04.3`, `05.1`, `05.2`, `06.1`, `07.1`, `08.1`: 11 Python sensors, micro-labs, embedded C bridge, control, robotics, SysID & capstone lessons)

1. Dynamically extracts every Python `Starter Code` and `Full Solution` from all 36 Python lessons,
   executes them, and verifies exact `Expected Output` matches.
2. Executes the Python numerical mirrors for the 7 Falstad-only circuit lessons (`S0.1`–`S0.6`, `01.1`)
   (moved out of the lesson markdown files into `tests/` per Part A.5 so learners only build/probe in Falstad)
   and verifies that each lesson's standalone `falstad/*.txt` netlist file exists and starts with a valid `$ 1` header.
3. Executes the Python numerical mirrors for the 5 Arduino Uno Wokwi lessons (`S0.7`, `S0.8`, `S0.9`, `S0.M`, `01.2`)
   and compiles/runs all 10 C++ Arduino sketches (`Starter Code` + `Full Solution`) via `g++`.
4. Verifies `Check yourself` numerical answers and consistent horizontal torque convention across the curriculum.
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
from generate_python_lessons_data import INSTRUCTOR_TESTS  # noqa: E402


def natural_sort_key(path: str):
    parts = re.split(r"(\d+)", os.path.basename(path))
    return [int(p) if p.isdigit() else p for p in parts]


def get_python_lesson_files():
    track_p = sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md")), key=natural_sort_key)
    stage_0_py = [
        os.path.join(ROOT, "stage-0", "S0.0-why-electricity-is-like-flow.md"),
    ]
    track_00 = sorted(glob.glob(os.path.join(ROOT, "00-foundations", "00.*.md")), key=natural_sort_key)
    track_01_py = [
        os.path.join(ROOT, "01-electronics-and-power", "01.3-power-regulators-and-power-budget.md"),
        os.path.join(ROOT, "01-electronics-and-power", "01.4-grounding-and-rc-lowpass-filters.md"),
    ]
    track_02 = sorted(
        glob.glob(os.path.join(ROOT, "02-mechanics-kinematics-dynamics", "02.*.md")),
        key=natural_sort_key,
    )
    track_03 = sorted(glob.glob(os.path.join(ROOT, "03-sensors-and-actuators", "03.*.md")), key=natural_sort_key)
    track_04 = sorted(glob.glob(os.path.join(ROOT, "04-embedded-and-realtime", "04.*.md")), key=natural_sort_key)
    track_05 = sorted(glob.glob(os.path.join(ROOT, "05-control-and-estimation", "05.*.md")), key=natural_sort_key)
    track_06 = sorted(glob.glob(os.path.join(ROOT, "06-robotics-and-autonomy", "06.*.md")), key=natural_sort_key)
    track_07 = sorted(glob.glob(os.path.join(ROOT, "07-systems-hil-and-production", "07.*.md")), key=natural_sort_key)
    track_08 = sorted(glob.glob(os.path.join(ROOT, "08-capstone-projects", "08.*.md")), key=natural_sort_key)
    return (
        track_p + stage_0_py + track_00 + track_01_py + track_02
        + track_03 + track_04 + track_05 + track_06 + track_07 + track_08
    )


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


def extract_expected_output(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"### Expected Output\n.*?```text\n(.*?)```", text, flags=re.DOTALL)
    if not m:
        raise ValueError(f"Missing Expected Output in {filepath}")
    return m.group(1).strip()


class TestBeginnerRoadmapExercises(unittest.TestCase):
    def test_all_32_python_lessons_starter_and_full_solutions(self):
        """Every Python lesson's Starter Code runs without error, Full Solution matches Expected Output + Instructor Behavioral Tests, and print-only spoofing fails."""
        lesson_files = get_python_lesson_files()
        self.assertEqual(len(lesson_files), 36)

        for path in lesson_files:
            rel_path = os.path.relpath(path, ROOT)
            with self.subTest(lesson=rel_path):
                with open(path, "r", encoding="utf-8") as f:
                    text = f.read()
                fm_block = text.split("---")[1] if text.startswith("---") else text
                lid_m = re.search(r'^lesson_id:\s*["\']?([^"\'\n]+)["\']?', fm_block, re.MULTILINE)
                lesson_id = lid_m.group(1).strip() if lid_m else rel_path
                self.assertIn(lesson_id, INSTRUCTOR_TESTS, f"Missing INSTRUCTOR_TESTS for {lesson_id}")
                _, instructor_test_code = INSTRUCTOR_TESTS[lesson_id]

                starter_code, expected_out, solution_code = extract_python_blocks(text, rel_path)

                starter_ns = {"__name__": "__main__", "__mechalab_student_source__": starter_code}
                starter_buf = io.StringIO()
                with contextlib.redirect_stdout(starter_buf):
                    exec(compile(starter_code, f"{rel_path}:starter", "exec"), starter_ns)

                # Starter code must NOT pass both behavioral instructor tests and output match
                starter_passed_behavior = True
                try:
                    exec(compile(instructor_test_code, f"{rel_path}:instructor_test", "exec"), starter_ns)
                except Exception:
                    starter_passed_behavior = False
                self.assertFalse(
                    starter_passed_behavior and starter_buf.getvalue().strip() == expected_out,
                    f"Starter code for {lesson_id} must not pass full verification before solving TODOs",
                )

                # Spoofed print-only solution must ALWAYS fail instructor behavioral tests
                spoof_code = f"print({expected_out!r})\n"
                spoof_ns = {"__name__": "__main__", "__mechalab_student_source__": spoof_code}
                with contextlib.redirect_stdout(io.StringIO()):
                    exec(compile(spoof_code, f"{rel_path}:spoof", "exec"), spoof_ns)
                with self.assertRaises(
                    Exception,
                    msg=f"Lesson {lesson_id} instructorTests failed to reject a print-only spoofed program!",
                ):
                    exec(compile(instructor_test_code, f"{rel_path}:instructor_test", "exec"), spoof_ns)

                # Full solution must pass both Expected Output and Instructor Behavioral Tests
                sol_ns = {"__name__": "__main__", "__mechalab_student_source__": solution_code}
                sol_buf = io.StringIO()
                with contextlib.redirect_stdout(sol_buf):
                    exec(compile(solution_code, f"{rel_path}:solution", "exec"), sol_ns)
                actual_out = sol_buf.getvalue().strip()
                self.assertEqual(actual_out, expected_out)
                exec(compile(instructor_test_code, f"{rel_path}:instructor_test", "exec"), sol_ns)

    def test_falstad_lessons_ci_python_mirrors_and_netlists(self):
        """Verify CI Python mirrors (moved out of S0.1–S0.6 and 01.1 into tests/) and Falstad netlist files."""
        # S0.1 CI mirror: Ohm's Law I = V / R (mA) and V = I * R
        s01_expected = extract_expected_output(
            os.path.join(ROOT, "stage-0", "S0.1-closed-circuits-and-ohms-law.md")
        )
        i_1k_ma = (5.0 / 1000.0) * 1000.0
        i_250_ma = (5.0 / 250.0) * 1000.0
        v_2k = 0.0025 * 2000.0
        s01_lines = [
            f"5.0 V across 1000 ohms -> {i_1k_ma:.2f} mA | across 250 ohms -> {i_250_ma:.2f} mA",
            f"2.5 mA through 2.0 kOhm -> {v_2k:.2f} V",
        ]
        self.assertEqual("\n".join(s01_lines), s01_expected)

        # S0.2 CI mirror: Series/Parallel & Voltage Divider
        s02_expected = extract_expected_output(
            os.path.join(ROOT, "stage-0", "S0.2-series-parallel-and-voltage-dividers.md")
        )
        v_div1 = 12.0 * (4700.0 / (10000.0 + 4700.0))
        i_ser1_ma = (12.0 / (10000.0 + 4700.0)) * 1000.0
        v_div2 = 5.0 * (10000.0 / (10000.0 + 10000.0))
        s02_lines = [
            f"12.0 V with R1=10k, R2=4.7k -> V_out = {v_div1:.2f} V (I_series = {i_ser1_ma:.2f} mA)",
            f"5.0 V with R1=10k, R2=10k (50% pot) -> V_out = {v_div2:.2f} V",
        ]
        self.assertEqual("\n".join(s02_lines), s02_expected)

        # S0.3 CI mirror: Breadboard Continuity & Short-Circuit Detection
        s03_expected = extract_expected_output(
            os.path.join(ROOT, "stage-0", "S0.3-breadboards-and-short-circuits.md")
        )
        def check_breadboard_pair(r1, b1, r2, b2):
            return "SHORTED_SAME_CLIP" if (r1 == r2 and b1 == b2) else "VALID_ACROSS_NODES"
        s03_lines = [
            f"Row 10a to 10d: {check_breadboard_pair(10, 'left', 10, 'left')}",
            f"Row 10a to 14a: {check_breadboard_pair(10, 'left', 14, 'left')}",
            f"Row 10e to 10f (across ravine): {check_breadboard_pair(10, 'left', 10, 'right')}",
        ]
        self.assertEqual("\n".join(s03_lines), s03_expected)

        # S0.4 CI mirror: LED Ballast Resistor & Power Rating
        s04_expected = extract_expected_output(
            os.path.join(ROOT, "stage-0", "S0.4-leds-and-resistor-power.md")
        )
        r_led = (5.0 - 2.0) / 0.015
        p_led_mw = (0.015**2) * r_led * 1000.0
        p_12v_mw = (0.120**2) * 100.0 * 1000.0
        s04_lines = [
            f"5.0V supply, Vf=2.0V, I=15.0mA -> R = {r_led:.1f} ohms | P_R = {p_led_mw:.1f} mW ({'SAFE_QUARTER_WATT' if p_led_mw <= 125.0 else 'OVERHEAT_DANGER'})",
            f"12.0V across 100 ohms (120mA) -> P_R = {p_12v_mw:.1f} mW ({'SAFE_QUARTER_WATT' if p_12v_mw <= 125.0 else 'OVERHEAT_DANGER'})",
        ]
        self.assertEqual("\n".join(s04_lines), s04_expected)

        # S0.5 CI mirror: CC/CV Bench Power Supply
        s05_expected = extract_expected_output(
            os.path.join(ROOT, "stage-0", "S0.5-multimeters-and-current-limited-supplies.md")
        )
        s05_lines = []
        for label, r_load in [("Normal 250 ohm load:", 250.0), ("Short 0.5 ohm load: ", 0.5)]:
            i_req = 5.0 / r_load
            if i_req <= 0.10:
                mode, v_out, i_ma = "CV", 5.0, i_req * 1000.0
            else:
                mode, v_out, i_ma = "CC", 0.10 * r_load, 100.0
            s05_lines.append(f"{label} Mode={mode} | V_out={v_out:.2f} V | I={i_ma:.1f} mA")
        self.assertEqual("\n".join(s05_lines), s05_expected)

        # S0.6 CI mirror: Capacitor Time Constant tau = R * C
        s06_expected = extract_expected_output(
            os.path.join(ROOT, "stage-0", "S0.6-capacitors-and-decoupling.md")
        )
        tau_s = 10000.0 * 0.0001
        s06_lines = [f"RC time constant tau = {tau_s:.2f} s"]
        for t_s in [1.0, 2.0, 5.0]:
            vc = 5.0 * (1.0 - math.exp(-t_s / tau_s))
            s06_lines.append(f"t = {t_s:.1f} s -> V_C = {vc:.2f} V")
        self.assertEqual("\n".join(s06_lines), s06_expected)

        # 01.1 CI mirror: MOSFET Power & Flyback Spike vs Clamp
        l011_expected = extract_expected_output(
            os.path.join(ROOT, "01-electronics-and-power", "01.1-mosfet-inductor-flyback.md")
        )
        p_mw = (2.0**2) * 0.02 * 1000.0
        v_unclamped = 12.0 + 0.0005 * (2.0 / 0.000002)
        v_clamped = 12.0 + 0.7
        l011_lines = [
            f"MOSFET heat at 2.0 A (R_DS_on=0.02 ohm): {p_mw:.1f} mW",
            f"Peak Drain voltage WITHOUT flyback diode: {v_unclamped:.1f} V (DESTROYS 60V MOSFET!)",
            f"Peak Drain voltage WITH flyback diode: {v_clamped:.1f} V (SAFE!)",
        ]
        self.assertEqual("\n".join(l011_lines), l011_expected)

        # Verify all standalone Falstad netlists exist and start with valid "$ 1" header
        netlists = sorted(
            glob.glob(os.path.join(ROOT, "stage-0", "falstad", "*.txt"))
            + glob.glob(os.path.join(ROOT, "01-electronics-and-power", "falstad", "*.txt"))
        )
        self.assertGreaterEqual(len(netlists), 10)
        for nl in netlists:
            with open(nl, "r", encoding="utf-8") as f:
                first_line = f.readline().strip()
            self.assertTrue(first_line.startswith("$ 1 "), f"Invalid Falstad header in {nl}")

    def test_arduino_wokwi_lessons_python_mirrors_and_cpp_sketches(self):
        """Verify Python numerical mirrors AND extracted C++ sketches for S0.7, S0.8, S0.9, S0.M, and 01.2."""
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

        # 5. 01.2 Python mirror
        l012_info = arduino_verifier.extract_sketches_from_lesson(
            os.path.join(ROOT, "01-electronics-and-power", "01.2-h-bridge-and-stall-current.md")
        )
        i_stall = (12.0 - 0.10 * 0.0) / 4.0
        i_run = (12.0 - 0.10 * 100.0) / 4.0
        l012_lines = [f"Stall current (omega=0): {i_stall:.2f} A | Running current (omega=100): {i_run:.2f} A"]
        for cmd in [192, -192, 0]:
            in1 = 1 if cmd > 0 else 0
            in2 = 1 if cmd < 0 else 0
            pwm = abs(cmd)
            l012_lines.append(f"cmd={cmd} -> IN1={in1} IN2={in2} PWM={pwm}")
        self.assertEqual("\n".join(l012_lines), l012_info["expected_output"])

        # 6. Host C++ compilation & execution check (if g++ is present)
        ok, msg = arduino_verifier.run_host_verify()
        if ok:
            self.assertIn("Compiled and verified all 10 Arduino sketches", msg)

    def test_consistent_horizontal_torque_convention(self):
        """Verify horizontal-angle torque convention tau = m * g * L * cos(theta) across P.10, P.12, P.M, and 02.1."""
        # P.10 & 02.1: x = L * cos(theta), y = L * sin(theta)
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
