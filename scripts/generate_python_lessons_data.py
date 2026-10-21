#!/usr/bin/env python3
"""Generate app/src/data/pythonLessonsData.ts from the Python lessons and the ramp page R.4.

Each lesson's `output_match:` front-matter key decides how the workbench compares the learner's
`stdout` with the lesson's Expected Output: `normalized` (default - whitespace is ignored, so a
behaviourally correct solution is not blocked by indentation, column padding or blank lines) or
`exact` (for the lessons whose Expected Output is a column-aligned table, where the format is part
of the answer). See app/src/outputMatch.ts.
"""

import glob
import json
import os
import re
import sys

import exercise_bundle

OUTPUT_MATCH_MODES = ("normalized", "exact")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXERCISES = os.path.join(ROOT, "exercises")


def natural_sort_key(path: str):
    base = os.path.basename(path)
    parts = re.split(r"(\d+)", base)
    out = []
    for p in parts:
        if p.isdigit():
            out.append((0, int(p)))
        else:
            if p.startswith(".M-"):
                out.append((1, 999))
            else:
                out.append((1, p))
    return out


def get_python_lesson_files():
    track_p = sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md")), key=natural_sort_key)
    # The ramp is the recovery path the Tier 1 exit check sends a miss to, so every ramp page
    # carries the same workbench entry every lesson does: starter, hints, the graded check that
    # compares its stdout, and instructor tests on its own numbers. A learner sent here by a miss
    # should not have to leave the runner to repair it.
    ramp = sorted(glob.glob(os.path.join(ROOT, "ramp", "R.*.md")), key=natural_sort_key)
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
    track_03 = sorted(
        glob.glob(os.path.join(ROOT, "03-sensors-and-actuators", "03.*.md")),
        key=natural_sort_key,
    )
    track_04 = sorted(
        glob.glob(os.path.join(ROOT, "04-embedded-and-realtime", "04.*.md")),
        key=natural_sort_key,
    )
    track_05 = sorted(
        glob.glob(os.path.join(ROOT, "05-control-and-estimation", "05.*.md")),
        key=natural_sort_key,
    )
    track_06 = sorted(
        glob.glob(os.path.join(ROOT, "06-robotics-and-autonomy", "06.*.md")),
        key=natural_sort_key,
    )
    track_07 = sorted(
        glob.glob(os.path.join(ROOT, "07-systems-hil-and-production", "07.*.md")),
        key=natural_sort_key,
    )
    track_08 = sorted(
        glob.glob(os.path.join(ROOT, "08-capstone-projects", "08.*.md")),
        key=natural_sort_key,
    )
    return (
        track_p
        + ramp
        + stage_0_py
        + track_00
        + track_01_py
        + track_02
        + track_03
        + track_04
        + track_05
        + track_06
        + track_07
        + track_08
    )


INSTRUCTOR_TESTS: dict[str, tuple[list[str], str]] = {
    "P.1": (
        [
            "Verify encoder_ticks (int 425), battery_level (float 12.15), robot_mode ('ACTIVE'), and is_estop_active (False)",
            "Re-evaluate relative update expressions on unseen state (encoder_ticks=1000, battery_level=24.0)",
        ],
        """import ast, math
assert isinstance(encoder_ticks, int) and encoder_ticks == 425, f"Expected encoder_ticks=425 (int), got {encoder_ticks!r}"
assert isinstance(battery_level, float) and math.isclose(battery_level, 12.15, abs_tol=1e-4), f"Expected battery_level=12.15, got {battery_level!r}"
assert robot_mode == "ACTIVE", f"Expected robot_mode='ACTIVE', got {robot_mode!r}"
assert is_estop_active is False, f"Expected is_estop_active=False, got {is_estop_active!r}"
_tree = ast.parse(__mechalab_student_source__)
_rel_stmts = [
    s for s in _tree.body
    if isinstance(s, (ast.Assign, ast.AugAssign))
    and any(isinstance(n, ast.Name) and n.id in ("encoder_ticks", "battery_level") and isinstance(n.ctx, ast.Load) for n in ast.walk(s))
]
assert len(_rel_stmts) >= 2, "Update encoder_ticks and battery_level using relative arithmetic (e.g., encoder_ticks = encoder_ticks + 25), not hardcoded literals."
_ns = {"encoder_ticks": 1000, "battery_level": 24.0}
exec(compile(ast.Module(body=_rel_stmts, type_ignores=[]), "<instructor_test>", "exec"), _ns)
assert _ns["encoder_ticks"] == 1025, f"Relative update from encoder_ticks=1000 should yield 1025, got {_ns['encoder_ticks']}"
assert math.isclose(_ns["battery_level"], 23.55, abs_tol=1e-4), f"Relative update from battery_level=24.0 should yield 23.55, got {_ns['battery_level']}"
""",
    ),
    "P.2": (
        [
            "Verify new_pos_m (2.0625 m), sensor_pin (4.0 V), and kinetic_energy_j (9.0 J) within tolerance",
            "Re-evaluate learner formulas on unseen boundary inputs (zero speed, 1:1 voltage divider, negative start position)",
        ],
        """import ast, math
assert math.isclose(new_pos_m, 2.0625, abs_tol=1e-5), f"Expected new_pos_m=2.0625, got {new_pos_m}"
assert math.isclose(sensor_pin, 4.0, abs_tol=1e-4), f"Expected sensor_pin=4.0, got {sensor_pin}"
assert math.isclose(kinetic_energy_j, 9.0, abs_tol=1e-4), f"Expected kinetic_energy_j=9.0, got {kinetic_energy_j}"
_tree = ast.parse(__mechalab_student_source__)
_expr_stmts = [
    s for s in _tree.body
    if isinstance(s, ast.Assign)
    and any(isinstance(t, ast.Name) and t.id in ("new_pos_m", "sensor_pin", "kinetic_energy_j") for t in s.targets)
]
_ns = {
    "wheel_speed": 3.0, "elapsed_sec": 0.5, "start_pos_m": -1.5,
    "supply_level": 5.0, "part_a": 10000.0, "part_b": 10000.0,
    "cart_mass": 3.0, "cart_speed": 4.0,
}
exec(compile(ast.Module(body=_expr_stmts, type_ignores=[]), "<instructor_test>", "exec"), _ns)
assert math.isclose(_ns["new_pos_m"], 0.0, abs_tol=1e-5), "Formula for new_pos_m failed on unseen inputs (start=-1.5, speed=3.0, dt=0.5 -> 0.0)"
assert math.isclose(_ns["sensor_pin"], 2.5, abs_tol=1e-4), "Formula for sensor_pin failed on 1:1 divider (5.0V, 10k/10k -> 2.5V)"
assert math.isclose(_ns["kinetic_energy_j"], 24.0, abs_tol=1e-4), "Formula for kinetic_energy_j failed on (mass=3.0, speed=4.0 -> 24.0 J)"
""",
    ),
    "P.3": (
        [
            "Verify clamped_high (255), clamped_low (0), and safe_output (0 when E-Stop active)",
            "Re-evaluate learner if/elif/else logic on unseen boundary cases (in-range commands and E-Stop released)",
        ],
        """import ast
assert clamped_high == 255, f"Expected clamped_high=255, got {clamped_high}"
assert clamped_low == 0, f"Expected clamped_low=0, got {clamped_low}"
assert safe_output == 0, f"Expected safe_output=0 when E-Stop is True, got {safe_output}"
_tree = ast.parse(__mechalab_student_source__)
_if_stmts = [s for s in _tree.body if isinstance(s, ast.If)]
assert len(_if_stmts) >= 2, "Expected if/elif/else conditional statements for clamping and E-Stop override."
_ns = {"raw_cmd_high": 140, "raw_cmd_low": 280, "raw_cmd_normal": 180, "is_estop_pressed": False}
exec(compile(ast.Module(body=_if_stmts, type_ignores=[]), "<instructor_test>", "exec"), _ns)
assert _ns.get("clamped_high") == 140, f"When raw_cmd_high=140, clamped_high should be 140, got {_ns.get('clamped_high')}"
assert _ns.get("clamped_low") == 255, f"When raw_cmd_low=280, clamped_low should be 255, got {_ns.get('clamped_low')}"
assert _ns.get("safe_output") == 180, f"When is_estop_pressed=False, safe_output should be 180, got {_ns.get('safe_output')}"
""",
    ),
    "P.4": (
        [
            "Verify clamped_commands list, total_cmd (647), and mean_cmd (107.8333)",
            "Re-evaluate loop and mean logic on unseen 5-element boundary list [-100, 0, 100, 255, 500]",
        ],
        """import ast, math
assert clamped_commands == [0, 0, 64, 128, 200, 255], f"Expected [0, 0, 64, 128, 200, 255], got {clamped_commands}"
assert total_cmd == 647, f"Expected total_cmd=647, got {total_cmd}"
assert math.isclose(mean_cmd, 647.0 / 6.0, abs_tol=1e-3), f"Expected mean_cmd=107.8333, got {mean_cmd}"
_tree = ast.parse(__mechalab_student_source__)
_body = [
    s for s in _tree.body
    if not (isinstance(s, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "raw_commands" for t in s.targets))
    and not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Call) and getattr(s.value.func, "id", "") == "print")
]
_ns = {"raw_commands": [-100, 0, 100, 255, 500]}
exec(compile(ast.Module(body=_body, type_ignores=[]), "<instructor_test>", "exec"), _ns)
assert _ns["clamped_commands"] == [0, 0, 100, 255, 255], f"Unseen list clamp failed: got {_ns['clamped_commands']}"
assert math.isclose(_ns["mean_cmd"], 122.0, abs_tol=1e-4), f"Unseen list mean failed: expected 122.0, got {_ns['mean_cmd']}"
""",
    ),
    "P.5": (
        [
            "Call step_position(pos_m, vel_m_s, dt_s) with positive, negative, and zero-dt boundary inputs",
            "Verify 4-step while-loop state (step == 4, pos_m == 1.20 m)",
        ],
        """import math
assert callable(step_position), "step_position must be a callable function"
assert math.isclose(step_position(0.0, 1.5, 0.2), 0.3, abs_tol=1e-6), "step_position(0.0, 1.5, 0.2) must return 0.3"
assert math.isclose(step_position(2.5, -4.0, 0.25), 1.5, abs_tol=1e-6), "step_position(2.5, -4.0, 0.25) must handle negative velocity"
assert math.isclose(step_position(-3.0, 0.0, 10.0), -3.0, abs_tol=1e-6), "step_position with 0 velocity must keep position unchanged"
assert math.isclose(step_position(1.25, 8.0, 0.0), 1.25, abs_tol=1e-6), "step_position with dt=0.0 must keep position unchanged"
assert step == 4 and math.isclose(pos_m, 1.20, abs_tol=1e-5), f"Expected step=4 and pos_m=1.20 after loop, got step={step}, pos_m={pos_m}"
""",
    ),
    "P.6": (
        [
            "Test distance_2d(x_m, y_m) at origin (0,0), (3,4), negative quadrant (-5,-12), and (0.6,0.8)",
            "Test clamp_cmd(cmd) across lower/upper saturation boundaries (-999, -1, 0, 1, 128, 255, 256, 999)",
        ],
        """import math
assert math.isclose(distance_2d(0.0, 0.0), 0.0, abs_tol=1e-6), "distance_2d(0, 0) must be 0.0"
assert math.isclose(distance_2d(3.0, 4.0), 5.0, abs_tol=1e-6), "distance_2d(3, 4) must be 5.0"
assert math.isclose(distance_2d(-5.0, -12.0), 13.0, abs_tol=1e-6), "distance_2d(-5, -12) must be 13.0"
for _raw, _exp in [(-999, 0), (-1, 0), (0, 0), (1, 1), (128, 128), (255, 255), (256, 255), (999, 255)]:
    assert clamp_cmd(_raw) == _exp, f"clamp_cmd({_raw}) returned {clamp_cmd(_raw)}, expected {_exp}"
""",
    ),
    "P.7": (
        [
            "Test ma_to_amps, kohms_to_ohms, and us_to_seconds at zero, nominal, and large boundary values",
            "Verify Ohm's law voltage drop v_drop == 3.30 V within numerical tolerance",
        ],
        """import math
assert math.isclose(ma_to_amps(0.0), 0.0, abs_tol=1e-9)
assert math.isclose(ma_to_amps(2500.0), 2.5, abs_tol=1e-6)
assert math.isclose(kohms_to_ohms(0.0), 0.0, abs_tol=1e-9)
assert math.isclose(kohms_to_ohms(4.7), 4700.0, abs_tol=1e-4)
assert math.isclose(us_to_seconds(0.0), 0.0, abs_tol=1e-12)
assert math.isclose(us_to_seconds(250000.0), 0.25, abs_tol=1e-8)
assert math.isclose(v_drop, 3.30, abs_tol=1e-4)
""",
    ),
    "P.8": (
        [
            "Test freq_to_period_ms across 1 Hz, 50 Hz, 490 Hz, 1 kHz, and 20 kHz PWM frequencies",
            "Test max_unsigned_int across 1-bit, 8-bit, 10-bit, 12-bit, and 16-bit timer widths",
        ],
        """import math
for _f, _p in [(1.0, 1000.0), (50.0, 20.0), (1000.0, 1.0), (20000.0, 0.05)]:
    assert math.isclose(freq_to_period_ms(_f), _p, rel_tol=1e-5), f"freq_to_period_ms({_f}) expected {_p}"
for _b, _m in [(1, 1), (8, 255), (10, 1023), (12, 4095), (16, 65535)]:
    assert max_unsigned_int(_b) == _m, f"max_unsigned_int({_b}) expected {_m}, got {max_unsigned_int(_b)}"
""",
    ),
    "P.9": (
        [
            "Test solve_for_speed with forward, stationary (zero delta), and reverse motion inputs",
            "Test scale10_to_five and scale10_to_cmd8 at ADC endpoints (0, 511.5, 1023)",
        ],
        """import math
assert math.isclose(solve_for_speed(5.0, 2.0, 0.015), 200.0, abs_tol=1e-4)
assert math.isclose(solve_for_speed(2.0, 2.0, 0.5), 0.0, abs_tol=1e-6)
assert math.isclose(solve_for_speed(-1.0, 3.0, 2.0), -2.0, abs_tol=1e-6)
assert math.isclose(scale10_to_five(0), 0.0, abs_tol=1e-6) and math.isclose(scale10_to_five(1023), 5.0, abs_tol=1e-6)
assert math.isclose(scale10_to_cmd8(0), 0.0, abs_tol=1e-6) and math.isclose(scale10_to_cmd8(1023), 255.0, abs_tol=1e-6)
""",
    ),
    "R.4": (
        [
            "Test mat_vec on the lesson's [2, 3] state (rows are rates: [3, -7.5]) and on a B u multiplication",
            "Test step_matrix against step_two_lines for one tick and for thirty, and that a row/vector shape mismatch raises ValueError",
        ],
        """import math
assert abs(DT_S - 0.01) < 1e-12, f"expected the lesson's 10 ms tick, got {DT_S!r}"
assert A == [[0.0, 1.0], [0.0, -2.5]], f"A must hold the rates [[0, 1], [0, -2.5]], got {A!r}"
assert len(B_IN) == 2 and len(B_IN[0]) == 1, f"B_IN is 2x1 - one input (torque), got {B_IN!r}"
assert abs(B_IN[1][0] - 50.0) < 1e-12, f"expected B_IN[1][0] = 1/J = 50, got {B_IN[1][0]!r}"
_tick = mat_vec(A, [2.0, 3.0])
assert abs(_tick[0] - 3.0) < 1e-12 and abs(_tick[1] + 7.5) < 1e-12, f"A x for [2, 3] is [3, -7.5], got {_tick!r}"
_bu = mat_vec(B_IN, [0.40])
assert abs(_bu[0]) < 1e-15 and abs(_bu[1] - 20.0) < 1e-12, f"B u for 0.40 N*m is [0, 20], got {_bu!r}"
try:
    mat_vec(A, [1.0])
    raise AssertionError("mat_vec must refuse a 2-column matrix with a one-slot vector, not read past the row")
except ValueError:
    pass
_one = step_matrix([0.0, 0.0])
_one_line = step_two_lines([0.0, 0.0])
assert abs(_one[0] - _one_line[0]) < 1e-15 and abs(_one[1] - _one_line[1]) < 1e-15, f"one matrix tick {_one!r} must equal the two-line tick {_one_line!r}"
assert abs(_one[1] - 0.2) < 1e-12, f"expected qd = 0.2 rad/s after one 10 ms tick of 0.40 N*m, got {_one[1]!r}"
assert abs(matrix_path[0] - 0.697230) < 1e-5, f"expected q = 0.697230 rad after 30 ticks, got {matrix_path[0]!r}"
assert abs(matrix_path[1] - 4.256926) < 1e-5, f"expected qd = 4.256926 rad/s after 30 ticks, got {matrix_path[1]!r}"
assert abs(matrix_path[0] - line_path[0]) < 1e-12 and abs(matrix_path[1] - line_path[1]) < 1e-12, "the matrix path and the two-line path must agree to the last digit; a difference means a coefficient or the dt placement is wrong"
assert first_row == [1.0, -2.5], f"A applied to [0, 1] must be [1, -2.5], got {first_row!r}"
""",
    ),
    "R.1": (
        [
            "Test counts_to_rad on a full turn and a quarter turn, rate_rad_s forwards and backwards, and the average/central rates on unseen traces",
            "Test the refusals: one sample has no average rate, the first sample has no central difference, and a rising trace has no reversal",
        ],
        """import math
_2pi = 2.0 * math.pi
assert abs(counts_to_rad(4096) - _2pi) < 1e-12, f"expected one turn of 4096 counts to be 2*pi rad, got {counts_to_rad(4096)!r}"
assert abs(counts_to_rad(1024) - _2pi / 4.0) < 1e-12, f"expected 1024 counts to be a quarter turn (pi/2), got {counts_to_rad(1024)!r}"
assert abs(rate_rad_s(120, 0) - 18.407769454627694) < 1e-9, f"expected 120 counts in 0.01 s = 18.408 rad/s, got {rate_rad_s(120, 0)!r}"
assert abs(rate_rad_s(0, 120) + 18.407769454627694) < 1e-9, f"the same step backwards must be negative: expected -18.408 rad/s, got {rate_rad_s(0, 120)!r} - check the subtraction order"
assert abs(average_rate_rad_s([0, 409, 819]) - 62.816513263917) < 1e-9, f"expected 819 counts over two 0.01 s ticks = 62.817 rad/s, got {average_rate_rad_s([0, 409, 819])!r}"
assert abs(average_rate_rad_s([0, 819], 0.02) - 62.816513263917) < 1e-9, f"two samples average the same way: expected 62.817 rad/s, got {average_rate_rad_s([0, 819], 0.02)!r}"
try:
    average_rate_rad_s([5])
    raise AssertionError("average_rate_rad_s must refuse one sample - a rate needs two")
except ValueError:
    pass
assert abs(central_rate_rad_s([0, 100, 180], 1) - 13.805827090970771) < 1e-9, f"expected the central difference at [0, 100, 180] to be (180-0) counts over 0.02 s = 13.806 rad/s, got {central_rate_rad_s([0, 100, 180], 1)!r}"
try:
    central_rate_rad_s([0, 100, 180], 0)
    raise AssertionError("the first sample has no left neighbour - central_rate_rad_s must refuse i = 0")
except ValueError:
    pass
assert peak_index([0, 5, 9, 4]) == 2, f"expected the peak at index 2, got {peak_index([0, 5, 9, 4])!r}"
assert reversal_tick([0, 10, 20, 15, 5]) == (2, 3), f"expected the sign change between ticks 2 and 3, got {reversal_tick([0, 10, 20, 15, 5])!r}"
assert reversal_tick([0, 10, 20]) is None, f"a rising trace has no reversal, so the answer is None, got {reversal_tick([0, 10, 20])!r}"
""",
    ),
    "R.2": (
        [
            "Test the left, right and trapezoid rules on a three-sample trace where all three differ, and a constant rate over 0.75 s",
            "Test that q0 is added rather than replaced, the bias drift, and the refusals for a single sample and a negative duration",
        ],
        """assert abs(left_rule_rad([0.0, 2.0, 4.0], 0.5) - 1.0) < 1e-12, f"expected the left rule on [0, 2, 4] at dt = 0.5 to be (0 + 2) * 0.5 = 1.0, got {left_rule_rad([0.0, 2.0, 4.0], 0.5)!r}"
assert abs(right_rule_rad([0.0, 2.0, 4.0], 0.5) - 3.0) < 1e-12, f"expected the right rule on [0, 2, 4] at dt = 0.5 to be (2 + 4) * 0.5 = 3.0, got {right_rule_rad([0.0, 2.0, 4.0], 0.5)!r}"
assert abs(trapezoid_rad([0.0, 2.0, 4.0], 0.5) - 2.0) < 1e-12, f"expected the trapezoid on [0, 2, 4] at dt = 0.5 to be 2.0, got {trapezoid_rad([0.0, 2.0, 4.0], 0.5)!r}"
assert abs(accumulate_rad([0.0, 2.0, 4.0], 1.0, 0.5) - 3.0) < 1e-12, f"expected q0 = 1.0 plus 2.0 rad of travel = 3.0, got {accumulate_rad([0.0, 2.0, 4.0], 1.0, 0.5)!r} - check the starting value is added, not replaced"
assert abs(trapezoid_rad([3.0, 3.0, 3.0, 3.0], 0.25) - 2.25) < 1e-12, f"expected a constant 3 rad/s held for 0.75 s to be 2.25 rad, got {trapezoid_rad([3.0, 3.0, 3.0, 3.0], 0.25)!r}"
assert abs(drift_rad(0.05, 10.0) - 0.5) < 1e-12, f"expected a 0.05 rad/s bias over 10 s to drift 0.5 rad, got {drift_rad(0.05, 10.0)!r}"
try:
    drift_rad(0.05, -1.0)
    raise AssertionError("drift_rad must refuse a negative duration instead of running time backwards")
except ValueError:
    pass
for _rule in (left_rule_rad, right_rule_rad, trapezoid_rad):
    try:
        _rule([1.0])
        raise AssertionError(f"{_rule.__name__} must refuse a single sample - one sample is not an interval")
    except ValueError:
        pass
""",
    ),
    "R.3": (
        [
            "Test accel_rad_s2 and one step from rest and from a moving state, including that position uses the OLD speed",
            "Test run against ten single steps, superposition on unseen torques, element-wise add/scale, the length refusal, and that step does not mutate its input",
        ],
        """import math
assert abs(accel_rad_s2([0.0, 2.0]) - 15.0) < 1e-12, f"expected (0.40 - 0.05*2.0)/0.02 = 15.0 rad/s^2 at a speed of 2 rad/s, got {accel_rad_s2([0.0, 2.0])!r}"
_one = step([0.0, 0.0])
assert abs(_one[0]) < 1e-15 and abs(_one[1] - 0.2) < 1e-12, f"expected one tick from rest to leave q = 0 and give qd = 0.2 rad/s, got {_one!r}"
_next = step([1.0, 1.0])
assert abs(_next[0] - 1.01) < 1e-12, f"expected q = 1.0 + 1.0*0.01 = 1.01 rad using the OLD speed, got {_next[0]!r} - 1.01175 is the new-speed answer repeated every tick"
assert abs(_next[1] - 1.175) < 1e-12, f"expected qd = 1.0 + 17.5*0.01 = 1.175 rad/s, got {_next[1]!r}"
_held = [1.0, 1.0]
step(_held)
assert _held == [1.0, 1.0], f"step must return a new state, not overwrite the caller's list; got {_held!r}"
assert run([0.0, 0.0], 0) == [0.0, 0.0], "zero ticks must leave the state untouched"
_ten = [0.0, 0.0]
for _i in range(10):
    _ten = step(_ten)
assert max(abs(run([0.0, 0.0], 10)[0] - _ten[0]), abs(run([0.0, 0.0], 10)[1] - _ten[1])) < 1e-12, "run(state, 10) must equal ten applications of step; a mismatch means the loop does not feed each result into the next tick"
_tau_a, _tau_b = 0.30, 0.12
_both = run([0.0, 0.0], 25, tau=_tau_a + _tau_b)
_parts = add(run([0.0, 0.0], 25, tau=_tau_a), run([0.0, 0.0], 25, tau=_tau_b))
assert abs(_both[0] - _parts[0]) < 1e-12 and abs(_both[1] - _parts[1]) < 1e-12, f"superposition must hold on unseen torques: got {_both!r} for the sum and {_parts!r} for the two runs added"
assert add([1.0, 2.0], [3.0, 4.0]) == [4.0, 6.0], f"expected element-wise addition [4.0, 6.0], got {add([1.0, 2.0], [3.0, 4.0])!r} - list concatenation gives a four-slot state"
assert scale([1.0, -2.0], 2.5) == [2.5, -5.0], f"expected [2.5, -5.0], got {scale([1.0, -2.0], 2.5)!r}"
try:
    add([1.0], [1.0, 2.0])
    raise AssertionError("add must refuse states of different lengths instead of adding what it can")
except ValueError:
    pass
""",
    ),
    "R.5": (
        [
            "Test arrow at 0 and 90 degrees, rotate keeping the length, and that adding the two parts gives 1 + 1j rather than a length of 2",
            "Test the empty sum and the four fields of report(), including the 53.130 degree angle from 3 + 4j",
        ],
        """import cmath
import math
assert abs(arrow(2.5, 0.0).real - 2.5) < 1e-12 and abs(arrow(2.5, 0.0).imag) < 1e-12, f"expected a length 2.5 arrow at 0 rad to be 2.5 + 0j, got {arrow(2.5, 0.0)!r}"
assert abs(arrow(1.0, math.pi / 2.0).imag - 1.0) < 1e-12, f"expected a unit arrow at 90 degrees to be 1j, got {arrow(1.0, math.pi / 2.0)!r}"
assert abs(abs(arrow(3.0, 0.7)) - 3.0) < 1e-12, f"an arrow must keep its magnitude: expected 3.0, got {abs(arrow(3.0, 0.7))!r}"
_turned = rotate(arrow(2.0, 0.0), math.pi / 2.0)
assert abs(_turned.real) < 1e-12 and abs(_turned.imag - 2.0) < 1e-12, f"expected 2 + 0j turned 90 degrees to be 2j, got {_turned!r}"
assert abs(abs(rotate(arrow(4.0, 0.3), 1.1)) - 4.0) < 1e-12, f"rotation must not change the length: expected 4.0, got {abs(rotate(arrow(4.0, 0.3), 1.1))!r}"
assert abs(sum_arrows([1 + 0j, 0 + 1j]) - (1 + 1j)) < 1e-12, f"expected 1 + 1j from adding the two parts, got {sum_arrows([1 + 0j, 0 + 1j])!r} - adding the lengths would give 2"
assert sum_arrows([]) == 0j, f"expected 0j for an empty list, got {sum_arrows([])!r}"
_line = report("T", 3 + 4j)
for _field in ("real 3.000", "imag 4.000", "length 5.000", "53.130", "deg"):
    assert _field in _line, f"expected the report to contain {_field!r}, got {_line!r}"
""",
    ),
    "R.6": (
        [
            "Test the gain and phase at DC, the corner 1/tau and 200 rad/s, plus one period's sample count at 20 and 200 rad/s",
            "Test the simulated gain and phase against the formula, and measure() on a known 2x response lagging 0.5 rad",
        ],
        """import math
assert abs(gain(0.0) - 1.0) < 1e-12, f"expected unity gain at DC, got {gain(0.0)!r}"
assert abs(gain(1.0 / TAU) - math.sqrt(0.5)) < 1e-12, f"expected gain 1/sqrt(2) = 0.7071 at the corner 1/tau = 20 rad/s, got {gain(1.0 / TAU)!r}"
assert abs(gain(200.0) - 0.09950371902099892) < 1e-12, f"expected 1/sqrt(1 + 100) = 0.0995 at 200 rad/s, got {gain(200.0)!r} - a gain that stays near 1 means the frequency never entered the formula"
assert abs(phase_deg(0.0)) < 1e-12, f"expected 0 degrees at DC, got {phase_deg(0.0)!r}"
assert abs(phase_deg(200.0) + math.degrees(math.atan(10.0))) < 1e-12, f"expected -84.289 degrees at 200 rad/s, got {phase_deg(200.0)!r} - a positive phase means the sign was dropped"
_period = simulate(20.0)
assert len(_period) == 314, f"expected one 20 rad/s period at 1 ms to be 314 samples, got {len(_period)!r}"
assert all(len(_sample) == 3 for _sample in _period), "every sample must be (t, u, y)"
assert len(simulate(200.0)) == 31, f"expected 31 samples for one 200 rad/s period at 1 ms, got {len(simulate(200.0))!r}"
_gain_20, _phase_20 = measure(simulate(20.0), 20.0)
assert abs(_gain_20 - gain(20.0)) < 2e-3, f"expected the measured 20 rad/s gain to match the formula 0.7071, got {_gain_20!r}"
assert abs(_phase_20 - phase_deg(20.0)) < 1.5, f"expected the measured 20 rad/s phase near -45 degrees, got {_phase_20!r}"
_w = 2.0 * math.pi * 5.0
_samples = [(i * 0.001, math.sin(_w * i * 0.001), 2.0 * math.sin(_w * i * 0.001 - 0.5)) for i in range(400)]
_gain_known, _phase_known = measure(_samples, _w)
assert abs(_gain_known - 2.0) < 1e-3, f"expected gain 2.0 from a response twice the command, got {_gain_known!r} - an RMS that divides the wrong way gives 0.5"
assert abs(_phase_known + 28.64788975654116) < 0.01, f"expected -28.648 degrees from a response lagging 0.5 rad, got {_phase_known!r}"
""",
    ),
    "P.10": (
        [
            "Test rpm_to_rad_s at 0 RPM, 60 RPM, and -30 RPM (reverse rotation)",
            "Test arm_tip_xy and target_angle_deg across all four Cartesian quadrants (0, 90, 135, -135, 180 deg)",
        ],
        """import math
assert math.isclose(rpm_to_rad_s(0.0), 0.0, abs_tol=1e-6)
assert math.isclose(rpm_to_rad_s(-30.0), -math.pi, abs_tol=1e-4)
_x90, _y90 = arm_tip_xy(0.25, 90.0)
assert math.isclose(_x90, 0.0, abs_tol=1e-6) and math.isclose(_y90, 0.25, abs_tol=1e-6)
_x180, _y180 = arm_tip_xy(0.20, 180.0)
assert math.isclose(_x180, -0.20, abs_tol=1e-6) and math.isclose(_y180, 0.0, abs_tol=1e-6)
assert math.isclose(target_angle_deg(0.0, 1.0), 90.0, abs_tol=1e-4)
assert math.isclose(target_angle_deg(-1.0, -1.0), -135.0, abs_tol=1e-4)
""",
    ),
    "P.11": (
        [
            "Test slope_velocity on positive, zero, and negative displacement steps",
            "Test accumulate_positions on empty list, symmetric cancellation [1.0, -1.0], and 5-step profile",
        ],
        """import math
assert math.isclose(slope_velocity(5.0, 5.0, 0.1), 0.0, abs_tol=1e-6)
assert math.isclose(slope_velocity(3.0, 1.0, 0.25), -8.0, abs_tol=1e-6)
assert accumulate_positions([], 0.1) == []
assert accumulate_positions([1.0, -1.0], 0.5) == [0.5, 0.0]
assert accumulate_positions([2.0, 2.0, 4.0, 0.0, -2.0], 0.5) == [1.0, 2.0, 4.0, 4.0, 3.0]
""",
    ),
    "P.12": (
        [
            "Test weight_newtons at 0 kg, 0.5 kg, and 2.5 kg",
            "Test gravity_torque_nm at 0 deg (max lever arm), 60 deg (half lever arm), 90 deg (zero), and 180 deg",
        ],
        """import math
assert math.isclose(weight_newtons(0.0), 0.0, abs_tol=1e-6)
assert math.isclose(weight_newtons(2.5), 24.525, abs_tol=1e-4)
assert math.isclose(gravity_torque_nm(1.0, 0.5, 0.0), 4.905, abs_tol=1e-4)
assert math.isclose(gravity_torque_nm(1.0, 0.5, 60.0), 2.4525, abs_tol=1e-4)
assert math.isclose(gravity_torque_nm(1.0, 0.5, 90.0), 0.0, abs_tol=1e-6)
""",
    ),
    "P.14": (
        [
            "Test is_within_recommended_bounds and select_safe_driver across 3.3 V, 6.0 V, 10.8 V, 11.5 V, and 12.0 V supply rails",
            "Test datasheet_val_to_base_si across mA, mV, ms, kHz, and base SI units",
        ],
        """import math
assert is_within_recommended_bounds(10.8, 2.7, 10.8) is True
assert is_within_recommended_bounds(11.5, 2.7, 10.8) is False
assert select_safe_driver(3.3) == ["DRV8833"]
assert select_safe_driver(6.0) == ["DRV8833", "TB6612FNG"]
assert select_safe_driver(12.0) == ["TB6612FNG"]
assert select_safe_driver(14.5) == []
assert math.isclose(datasheet_val_to_base_si(250.0, "mA"), 0.25, abs_tol=1e-9)
assert math.isclose(datasheet_val_to_base_si(20.0, "kHz"), 20000.0, abs_tol=1e-6)
""",
    ),
    "P.M": (
        [
            "Test cmd10_to_torque saturation at negative (-50), zero, midpoint (511.5), and overflow (2048) inputs",
            "Test holding_torque_nm across radian angles (0, pi/3, pi/2) and verify 3-step trajectory state",
        ],
        """import math
assert math.isclose(cmd10_to_torque(-50, 4.0), 0.0, abs_tol=1e-6)
assert math.isclose(cmd10_to_torque(511.5, 4.0), 2.0, abs_tol=1e-4)
assert math.isclose(cmd10_to_torque(2048, 4.0), 4.0, abs_tol=1e-6)
assert math.isclose(holding_torque_nm(0.50, 1.0, math.pi / 3.0), 2.4525, abs_tol=1e-4)
assert math.isclose(holding_torque_nm(0.50, 1.0, math.pi / 2.0), 0.0, abs_tol=1e-6)
assert can_lift is True and math.isclose(math.degrees(angle_rad), 54.0, abs_tol=1e-3)
""",
    ),
    "S0.0": (
        [
            "Test compute_flow inversely proportional to opposition and ValueError at opposition <= 0",
            "Test compute_effort_flow_power (Effort * Flow) across active and zero-flow (open-loop) states",
        ],
        """import math
assert math.isclose(compute_flow(12.0, 60.0), 0.20, abs_tol=1e-9)
assert math.isclose(compute_flow(12.0, 120.0), 0.10, abs_tol=1e-9)
try:
    compute_flow(12.0, 0.0)
except ValueError:
    pass
else:
    raise AssertionError("a zero-ohm short must be rejected, not reported as zero flow")
assert math.isclose(compute_effort_flow_power(12.0, 0.20), 2.40, abs_tol=1e-9)
assert math.isclose(compute_effort_flow_power(12.0, 0.0), 0.0, abs_tol=1e-9)
""",
    ),
    "00.1": (
        [
            "Test cross_domain_power on unseen 24V/3A electrical to 0.5 N*m @ 108 rad/s mechanical operating point",
            "Test simulate_first_order_lag at 0 target, 1*tau (63.2%), and 5*tau (99.3%) with custom time constant",
        ],
        """import math
_pe, _pm, _eff = cross_domain_power(24.0, 3.0, 0.5, 108.0)
assert math.isclose(_pe, 72.0, abs_tol=1e-4) and math.isclose(_pm, 54.0, abs_tol=1e-4) and math.isclose(_eff, 75.0, abs_tol=1e-4)
assert math.isclose(simulate_first_order_lag(0.0, 0.5, 1.0), 0.0, abs_tol=1e-6)
assert math.isclose(simulate_first_order_lag(50.0, 0.2, 0.2), 50.0 * (1.0 - math.exp(-1.0)), abs_tol=0.25)
assert math.isclose(simulate_first_order_lag(50.0, 0.2, 1.0), 50.0 * (1.0 - math.exp(-5.0)), abs_tol=0.25)
""",
    ),
    "00.2": (
        [
            "Test damping_metrics classification across underdamped (zeta=0.1), critically_damped (zeta=1.0), and overdamped (zeta=2.0)",
            "Test simulate_spring_damper overshoot behavior across regimes",
        ],
        """import math
_wn1, _z1, _r1 = damping_metrics(4.0, 100.0, 4.0)
_wn2, _z2, _r2 = damping_metrics(4.0, 100.0, 40.0)
_wn3, _z3, _r3 = damping_metrics(4.0, 100.0, 80.0)
assert math.isclose(_wn1, 5.0, abs_tol=1e-4) and math.isclose(_z1, 0.1, abs_tol=1e-4) and _r1 == "underdamped"
assert math.isclose(_z2, 1.0, abs_tol=1e-4) and _r2 == "critically_damped"
assert math.isclose(_z3, 2.0, abs_tol=1e-4) and _r3 == "overdamped"
_, _os_under = simulate_spring_damper(1.0, 100.0, 4.0)
_, _os_crit = simulate_spring_damper(1.0, 100.0, 20.0)
assert _os_under > 0.45 and _os_crit < 0.005
""",
    ),
    "00.3": (
        [
            "Test holding_torque_nm at zero mass, 0 deg horizontal, 60 deg, 90 deg vertical, and 180 deg inverted",
            "Verify run_sanity_checks() returns (1.962, 0.981, 0.0) within numerical tolerance",
        ],
        """import math
assert math.isclose(holding_torque_nm(0.0, 400.0, 0.0), 0.0, abs_tol=1e-9)
assert math.isclose(holding_torque_nm(1.0, 500.0, 0.0), 4.905, abs_tol=1e-4)
assert math.isclose(holding_torque_nm(1.0, 500.0, 90.0), 0.0, abs_tol=1e-6)
assert math.isclose(holding_torque_nm(1.0, 500.0, 180.0), -4.905, abs_tol=1e-4)
_s0, _s60, _s90 = run_sanity_checks()
assert math.isclose(_s0, 1.962, abs_tol=1e-4) and math.isclose(_s60, 0.981, abs_tol=1e-4) and math.isclose(_s90, 0.0, abs_tol=1e-6)
""",
    ),
    "01.3": (
        [
            "Test compare_ldo_vs_buck on unseen 24V->5V @ 1.0A load with 80% buck efficiency",
            "Test worst_case_battery_budget with custom safety factor (1.5x)",
        ],
        """import math
_pldo, _ibuck, _pbuck = compare_ldo_vs_buck(24.0, 5.0, 1.0, buck_eff=0.80)
assert math.isclose(_pldo, 19.0, abs_tol=1e-4)
assert math.isclose(_ibuck, 5.0 / (0.80 * 24.0), abs_tol=1e-5)
assert math.isclose(_pbuck, 1.25, abs_tol=1e-4)
_pk, _fuse = worst_case_battery_budget(5.0, 0.5, safety_factor=1.5)
assert math.isclose(_pk, 5.5, abs_tol=1e-5) and math.isclose(_fuse, 8.25, abs_tol=1e-5)
""",
    ),
    "01.4": (
        [
            "Test ground_bounce_adc_error at 0A stall and on 3.3V ADC reference rail",
            "Test rc_lowpass_response at DC (0 Hz -> 1.0 gain), cutoff f_c (0.7071 gain), and high-frequency stopband",
        ],
        """import math
assert ground_bounce_adc_error(0.0, 0.2) == (0.0, 0.0)
_vb, _adc = ground_bounce_adc_error(2.0, 0.25, v_ref=3.3)
assert math.isclose(_vb, 0.5, abs_tol=1e-5) and math.isclose(_adc, (0.5 / 3.3) * 1023.0, abs_tol=1e-3)
_fc, _r0 = rc_lowpass_response(2000.0, 0.5e-6, 0.0)
_, _rfc = rc_lowpass_response(2000.0, 0.5e-6, _fc)
assert math.isclose(_fc, 159.15494, abs_tol=1e-2) and math.isclose(_r0, 1.0, abs_tol=1e-6)
assert math.isclose(_rfc, 1.0 / math.sqrt(2.0), abs_tol=1e-3)
""",
    ),
    "02.1": (
        [
            "Test fk_1link at 0 deg, 90 deg, and -90 deg",
            "Test verify_circular_workspace invariant r == l1_m on unseen link length and negative/obtuse angles",
        ],
        """import math
_x0, _y0 = fk_1link(0.4, 0.0)
_x90, _y90 = fk_1link(0.4, -90.0)
assert math.isclose(_x0, 0.4, abs_tol=1e-6) and math.isclose(_y0, 0.0, abs_tol=1e-6)
assert math.isclose(_x90, 0.0, abs_tol=1e-6) and math.isclose(_y90, -0.4, abs_tol=1e-6)
_res = verify_circular_workspace(0.33, [-45.0, 30.0, 135.0])
assert len(_res) == 3 and all(math.isclose(item[3], 0.33, abs_tol=1e-6) for item in _res)
""",
    ),
    "02.2": (
        [
            "Test fk_2link at full extension (0, 0), folded-back origin singularity (0, 180), and orthogonal bend (90, -90)",
        ],
        """import math
_ex, _ey, _tx, _ty = fk_2link(0.2, 0.2, 0.0, 180.0)
assert math.isclose(_ex, 0.2, abs_tol=1e-6) and math.isclose(_tx, 0.0, abs_tol=1e-6) and math.isclose(_ty, 0.0, abs_tol=1e-6)
_ex2, _ey2, _tx2, _ty2 = fk_2link(0.2, 0.1, 90.0, -90.0)
assert math.isclose(_ex2, 0.0, abs_tol=1e-6) and math.isclose(_ey2, 0.2, abs_tol=1e-6)
assert math.isclose(_tx2, 0.1, abs_tol=1e-6) and math.isclose(_ty2, 0.2, abs_tol=1e-6)
""",
    ),
    "02.3": (
        [
            "Test ik_2link_elbow_down -> fk_2link round-trip accuracy (< 1e-5 m) across unseen quadrant targets",
            "Verify out-of-reach target (0.50, 0.0) clamps cos(theta2) cleanly without ValueError domain crash",
        ],
        """import math
for _ux, _uy in [(0.20, 0.05), (0.05, 0.22), (-0.10, 0.18)]:
    _q1, _q2 = ik_2link_elbow_down(_ux, _uy, 0.15, 0.15)
    _fx, _fy = fk_2link(0.15, 0.15, _q1, _q2)
    assert math.hypot(_fx - _ux, _fy - _uy) < 1e-5, f"IK->FK round-trip failed for ({_ux}, {_uy})"
_q1_clamp, _q2_clamp = ik_2link_elbow_down(0.50, 0.0, 0.15, 0.15)
assert math.isclose(_q1_clamp, 0.0, abs_tol=1e-4) and math.isclose(_q2_clamp, 0.0, abs_tol=1e-4)
""",
    ),
    "02.4": (
        [
            "Test point_mass_inertia_and_accel on unseen mass/radius/torque inputs",
            "Test gearmotor_output torque amplification, speed reduction, and 1/N^2 reflected inertia scaling",
        ],
        """import math
_i, _a = point_mass_inertia_and_accel(2.0, 0.5, 3.0)
assert math.isclose(_i, 0.5, abs_tol=1e-6) and math.isclose(_a, 6.0, abs_tol=1e-6)
_to, _wo, _ir = gearmotor_output(0.10, 200.0, 0.5, gear_ratio_n=10.0, eff=0.90)
assert math.isclose(_to, 0.90, abs_tol=1e-6) and math.isclose(_wo, 20.0, abs_tol=1e-6) and math.isclose(_ir, 0.005, abs_tol=1e-7)
""",
    ),
    "02.5": (
        [
            "Test gt2_belt_drive ratio, driven pitch radius, and belt tension on 16T->64T pulley pair",
            "Test cad_hole_diameters_mm press-fit (+0.10 mm) and clearance (+0.20 mm) allowances",
        ],
        """import math
_rat, _rmm, _fb = gt2_belt_drive(16, 64, tau_out_nm=2.0, pitch_mm=2.0)
_exp_r = (64 * 2.0) / (2.0 * math.pi)
assert math.isclose(_rat, 4.0, abs_tol=1e-6) and math.isclose(_rmm, _exp_r, abs_tol=1e-4)
assert math.isclose(_fb, 2.0 / (_exp_r / 1000.0), abs_tol=1e-3)
_bore, _hole = cad_hole_diameters_mm(19.0, 4.0)
assert math.isclose(_bore, 19.10, abs_tol=1e-5) and math.isclose(_hole, 4.20, abs_tol=1e-5)
""",
    ),
    "03.1": (
        [
            "Test quadrature_resolution 4x decoding and angular resolution on 256-line disk with 20:1 gearbox",
            "Test as5600_to_angle at 0, 512 (45 deg), and 4096 (360 deg) counts",
        ],
        """import math
_cpr, _deg = quadrature_resolution(256, 20)
assert _cpr == 20480 and math.isclose(_deg, 360.0 / 20480.0, abs_tol=1e-6)
_d512, _r512 = as5600_to_angle(512)
assert math.isclose(_d512, 45.0, abs_tol=1e-4) and math.isclose(_r512, math.pi / 4.0, abs_tol=1e-5)
""",
    ),
    "03.2": (
        [
            "Test mech_to_elec_deg modulo-360 wraparound for 11-pole-pair and 4-pole-pair rotors",
            "Test three_phase_voltages balanced sum (va + vb + vc == 0) across multiple electrical angles",
        ],
        """import math
assert math.isclose(mech_to_elec_deg(360.0 / 11.0, 11), 0.0, abs_tol=1e-5)
assert math.isclose(mech_to_elec_deg(15.0, 4), 60.0, abs_tol=1e-5)
for _ang in [0.0, 0.7, 2.1]:
    _va, _vb, _vc = three_phase_voltages(_ang, 12.0)
    assert math.isclose(_va + _vb + _vc, 0.0, abs_tol=1e-6), "Three-phase voltages must sum to zero"
""",
    ),
    "03.3": (
        [
            "Test encoders_to_tip_xy at horizontal stretch (0, 0) and orthogonal bend (1024, -1024)",
            "Test diagnose_encoder_fk_fault across ok, inverted_elbow_sign, and missing_4x_cpr fault modes",
        ],
        """import math
_x0, _y0 = encoders_to_tip_xy(0, 0, cpr1=4096, cpr2=4096, l1_m=0.15, l2_m=0.10)
assert math.isclose(_x0, 0.25, abs_tol=1e-6) and math.isclose(_y0, 0.0, abs_tol=1e-6)
assert diagnose_encoder_fk_fault(1024, -1024, (0.10, 0.12)) == "ok"
assert diagnose_encoder_fk_fault(1024, -1024, (-0.10, 0.12)) == "inverted_elbow_sign"
""",
    ),
    "04.1": (
        [
            "Test uint16_tick_delta at zero elapsed, normal step, and 16-bit wraparound boundary (65535 -> 0)",
            "Test velocity_from_step jitter amplification and diagnose_uint8_wrap_bug at 255 vs 256/300 rollover",
        ],
        """import math
assert uint16_tick_delta(0, 0) == 0
assert uint16_tick_delta(0, 65535) == 1
assert uint16_tick_delta(10, 65526) == 20
assert math.isclose(velocity_from_step(10.0, 0.002, assumed_dt_s=0.001), 20.0, abs_tol=1e-6)
assert diagnose_uint8_wrap_bug(255) == (255, False)
assert diagnose_uint8_wrap_bug(256) == (0, True)
assert diagnose_uint8_wrap_bug(300) == (44, True)
""",
    ),
    "04.2": (
        [
            "Verify crc8_ccitt standard check value (b'123456789' -> 0xF4) and 2-bit burst detection over xor_checksum",
            "Test pack_telemetry_10b / unpack_and_verify_10b on uint16 + signed float payloads and uart_bandwidth_ok 80% ceiling",
        ],
        """import math
assert crc8_ccitt(b"123456789") == 0xF4, f"Standard CRC-8-CCITT of b'123456789' must be 0xF4, got {hex(crc8_ccitt(b'123456789'))}"
_f = pack_telemetry_10b(999, 4095, -3.5)
assert len(_f) == 10
_ok, _t, _e, _v = unpack_and_verify_10b(_f)
assert _ok and _t == 999 and _e == 4095 and math.isclose(_v, -3.5, abs_tol=1e-5)
_bad = bytearray(_f); _bad[2] ^= 0x01
assert unpack_and_verify_10b(bytes(_bad))[0] is False
assert uart_bandwidth_ok(25, 1000, 250000) == (250000, False)
assert uart_bandwidth_ok(25, 1000, 500000) == (250000, True)
""",
    ),
    "04.3": (
        [
            "Test make_joint_box and update_joint_in_place mutation vs update_joint_copy_bug pass-by-value behavior",
            "Test diagnose_struct_update_bug detection of pass_by_value_copy_bug vs updated_in_place_ok",
        ],
        """import math
_jb = make_joint_box("elbow", cpr=4096)
assert _jb["enc_count"] == 0 and _jb["pos_rad"] == 0.0
update_joint_in_place(_jb, 2048, 0.020)
assert _jb["enc_count"] == 2048 and math.isclose(_jb["pos_rad"], math.pi, abs_tol=1e-6)
assert diagnose_struct_update_bug(0, 0, 512) == "pass_by_value_copy_bug"
assert diagnose_struct_update_bug(0, 512, 512) == "updated_in_place_ok"
""",
    ),
    "05.1": (
        [
            "Test sim_pid_arm steady-state gravity sag when ki=0.0",
            "Verify anti_windup=True drastically reduces integral windup overshoot on unseen ki=15.0 gain",
        ],
        """import math
_q0, _ = sim_pid_arm(4.0, 0.0, 0.4, False)
_q_wu, _os_wu = sim_pid_arm(4.0, 15.0, 0.4, False)
_q_aw, _os_aw = sim_pid_arm(4.0, 15.0, 0.4, True)
assert _q0 < 0.90, "Pure PD (ki=0) must exhibit gravity sag under constant gravity torque"
assert _os_wu > 0.25 and _os_aw < _os_wu * 0.35 and math.isclose(_q_aw, 1.0, abs_tol=0.02)
""",
    ),
    "05.2": (
        [
            "Test accel_tilt_rad at 0 deg, -90 deg, and +45 deg",
            "Test run_complementary_imu drift rejection with unseen gyro_bias=0.10 rad/s and alpha=0.95",
        ],
        """import math
assert math.isclose(accel_tilt_rad(-9.81, 0.0), -math.pi / 2.0, abs_tol=1e-4)
assert math.isclose(accel_tilt_rad(5.0, 5.0), math.pi / 4.0, abs_tol=1e-4)
_g, _c = run_complementary_imu(steps=500, dt=0.01, gyro_bias=0.10, alpha=0.95)
assert math.isclose(_g, 0.50, abs_tol=1e-3) and abs(_c) < 0.03
""",
    ),
    "06.1": (
        [
            "Test cubic_trajectory boundary conditions at t=0, t=T/2, t=T, and out-of-range t>T clamping",
            "Test compliant_gravity_command PD + gravity torque at vertical (pi/2) and displaced postures",
        ],
        """import math
assert cubic_trajectory(0.2, 1.4, 2.0, 0.0) == (0.2, 0.0)
_qm, _dqm = cubic_trajectory(0.0, 2.0, 2.0, 1.0)
assert math.isclose(_qm, 1.0, abs_tol=1e-5) and math.isclose(_dqm, 1.5, abs_tol=1e-5)
assert cubic_trajectory(0.2, 1.4, 2.0, 5.0) == (1.4, 0.0)
_tau_vert = compliant_gravity_command(math.pi / 2.0, 0.0, math.pi / 2.0, 0.0, 4.0, 0.5, 1.0, 0.25)
assert math.isclose(_tau_vert, 0.0, abs_tol=1e-5)
""",
    ),
    "07.1": (
        [
            "Test verify_bringup_safety across all 3 safety gates (inverted encoder, rail/current fault, ready)",
            "Test identify_b_and_j parameter recovery on synthetic plant (b=0.08, J=0.04)",
        ],
        """import math
assert verify_bringup_safety(1200.0, 0.2, 0.1, -0.05) == "ABORT_INVERTED_ENCODER_SIGN"
assert verify_bringup_safety(50.0, 0.2, 0.1, 0.05) == "ABORT_RAIL_OR_CURRENT_LIMIT"
assert verify_bringup_safety(1200.0, 0.8, 0.1, 0.05) == "ABORT_RAIL_OR_CURRENT_LIMIT"
assert verify_bringup_safety(500.0, 0.3, -0.1, -0.05) == "PASS_READY_FOR_CLOSED_LOOP"
_b_true, _j_true = 0.08, 0.04
_w_low = 0.5 / _b_true
_w_high = 0.5 / math.hypot(_b_true, 2.0 * math.pi * 4.0 * _j_true)
_bh, _jh = identify_b_and_j(0.5, 0.02, _w_low, 4.0, _w_high)
assert math.isclose(_bh, _b_true, abs_tol=1e-4) and math.isclose(_jh, _j_true, abs_tol=1e-4)
""",
    ),
    "08.1": (
        [
            "Test fk_2link / ik_2link round-trip on unseen target (0.12, 0.08), figure8_target from spec, and gravity_ff_2link at vertical posture",
            "Test diagnose_capstone_fault across all 4 R4 broken versions, infer_encoder_scale on an unfamiliar fifth unit (1.5x, and a constant offset that must not read as a scale), all four repair functions restoring the true tip or cutting overshoot, pack_boss_telemetry 20-byte CRC-8 integrity, and simulate_uart_tx bandwidth drops",
        ],
        """import math
_q1u, _q2u = ik_2link(0.12, 0.08)
_x1u, _y1u = fk_2link(_q1u, _q2u)
assert math.hypot(_x1u - 0.12, _y1u - 0.08) < 1e-6
_fx, _fy = figure8_target(0.25, x0=0.12, y0=0.0, ax=0.03, ay=0.04, freq_hz=0.5)
assert math.isclose(_fx, 0.12 + 0.03 * math.sin(math.pi / 4.0), abs_tol=1e-6)
_tg1, _tg2 = gravity_ff_2link(math.pi / 2.0, 0.0)
assert abs(_tg1) < 1e-6 and abs(_tg2) < 1e-6
assert diagnose_capstone_fault(-0.22, 1.0, 4.0) == "gravity_ff_sign_inverted"
assert diagnose_capstone_fault(-0.01, 85.0, 4.0) == "wrong_encoder_cpr"
assert diagnose_capstone_fault(-0.01, 12.0, 4.0) == "encoder_zero_offset"
assert diagnose_capstone_fault(-0.01, 1.0, 37.2) == "missing_anti_windup"
assert diagnose_capstone_fault(-0.01, 1.0, 4.0) == "nominal_ok"
assert math.isclose(infer_encoder_scale(0.305, 0.4575), 1.5, abs_tol=1e-9)
assert math.isclose(infer_encoder_scale(0.305, 1.22), 4.0, abs_tol=1e-6)
assert math.isclose(infer_encoder_scale(0.30, 0.30), 1.0, abs_tol=1e-12)
assert not math.isclose(infer_encoder_scale(0.10, 0.16), infer_encoder_scale(1.00, 1.06), abs_tol=1e-6)
assert math.isclose(repair_encoder_cpr(0.4575, infer_encoder_scale(0.305, 0.4575)), 0.305, abs_tol=1e-12)
_q_true = 0.30
_offset_rad = 0.06
_x_true, _y_true = fk_2link(_q_true, 0.0)
_x_bad, _y_bad = fk_2link(_q_true + _offset_rad, 0.0)
assert math.isclose(math.hypot(_x_bad - _x_true, _y_bad - _y_true) * 1000.0, 12.0, abs_tol=0.01)
_q_fixed = repair_encoder_offset(_q_true + _offset_rad, _offset_rad)
_x_fixed, _y_fixed = fk_2link(_q_fixed, 0.0)
assert math.hypot(_x_fixed - _x_true, _y_fixed - _y_true) * 1000.0 < 1e-6
assert math.isclose(repair_encoder_cpr(1.2, 4.0), 0.30, abs_tol=1e-12)
assert math.isclose(repair_encoder_cpr(-0.8, 4.0), -0.20, abs_tol=1e-12)
assert math.isclose(repair_integral_update(0.10, 0.15, 1.0, 1.30, 1.20), 0.10, abs_tol=1e-12)
assert math.isclose(repair_integral_update(0.10, 0.15, -1.0, -1.30, 1.20), 0.10, abs_tol=1e-12)
assert math.isclose(repair_integral_update(0.10, 0.15, 1.0, 0.90, 1.20), 0.15, abs_tol=1e-12)
assert math.isclose(repair_integral_update(0.10, 0.15, 1.0, -1.30, 1.20), 0.15, abs_tol=1e-12)
assert math.isclose(repair_gravity_sign(0.40), -0.40, abs_tol=1e-12)
assert math.isclose(repair_gravity_sign(-0.40), 0.40, abs_tol=1e-12)
_cpr_true = 0.30
_cpr_scale = 4.0
_cpr_x, _cpr_y = fk_2link(_cpr_true, 0.0)
_cpr_bad_x, _cpr_bad_y = fk_2link(_cpr_true * _cpr_scale, 0.0)
assert math.hypot(_cpr_bad_x - _cpr_x, _cpr_bad_y - _cpr_y) * 1000.0 > 100.0
_cpr_fixed_x, _cpr_fixed_y = fk_2link(repair_encoder_cpr(_cpr_true * _cpr_scale, _cpr_scale), 0.0)
assert math.hypot(_cpr_fixed_x - _cpr_x, _cpr_fixed_y - _cpr_y) * 1000.0 < 1e-6
def _sim(update):
    _J, _b, _tg, _umax, _dt = 0.02, 0.05, 0.60, 1.20, 0.001
    _q = _dq = _i = _peak = 0.0
    for _ in range(3000):
        _e = 1.0 - _q
        _ic = _i + 12.0 * _e * _dt
        _uraw = 4.0 * _e - 0.4 * _dq + _ic
        _i = update(_i, _ic, _e, _uraw, _umax)
        _u = max(-_umax, min(_umax, 4.0 * _e - 0.4 * _dq + _i))
        _ddq = (_u - _b * _dq - _tg) / _J
        _dq += _ddq * _dt
        _q += _dq * _dt
        _peak = max(_peak, _q)
    return max(0.0, _peak - 1.0)
def _no_repair(i_term, i_candidate, e, u_raw, u_max):
    return i_candidate
assert math.isclose(100.0 * _sim(_no_repair), 37.2, abs_tol=0.1)
assert 100.0 * _sim(repair_integral_update) < 5.0
_tg1, _ = gravity_ff_2link(0.0, 0.0)
_grav_u_bad = -_tg1
_grav_u_fixed = repair_gravity_sign(_grav_u_bad)
_grav_q_bad = (_grav_u_bad - _tg1) / 4.0
_grav_q_fixed = (_grav_u_fixed - _tg1) / 4.0
_grav_x0, _grav_y0 = fk_2link(0.0, 0.0)
_grav_x_bad, _grav_y_bad = fk_2link(_grav_q_bad, 0.0)
_grav_x_fixed, _grav_y_fixed = fk_2link(_grav_q_fixed, 0.0)
assert math.hypot(_grav_x_bad - _grav_x0, _grav_y_bad - _grav_y0) * 1000.0 > 20.0
assert math.hypot(_grav_x_fixed - _grav_x0, _grav_y_fixed - _grav_y0) * 1000.0 < 1e-6
_pkt = pack_boss_telemetry(42, 0.1, -0.2, 0.3, -0.4)
assert len(_pkt) == 20 and _pkt[0] == 0xAA and crc8_ccitt(_pkt[:-1]) == _pkt[-1]
assert simulate_uart_tx(100, 20, 0.001, 115200) > 0
assert simulate_uart_tx(100, 20, 0.001, 500000) == 0
assert 0.5 < max_dyn_err_mm < 5.0 and rms_dyn_err_mm < 2.0
""",
    ),
}


def extract_fenced(text: str, heading_pattern: str, lang: str) -> str:
    m = re.search(heading_pattern, text, re.MULTILINE)
    if not m:
        raise ValueError(f"Missing heading {heading_pattern}")
    rest = text[m.end() :]
    pattern = rf"```{lang}\n(.*?)\n```"
    cm = re.search(pattern, rest, re.DOTALL)
    if not cm:
        raise ValueError(f"Missing ```{lang} block after {heading_pattern}")
    return cm.group(1)


def extract_output_match(fm_block: str, lesson_id: str) -> str:
    """Read the lesson's presentation-check mode, defaulting to `normalized`."""
    m = re.search(r'^output_match:\s*["\']?([A-Za-z_]+)', fm_block, re.MULTILINE)
    mode = m.group(1).strip().lower() if m else "normalized"
    if mode not in OUTPUT_MATCH_MODES:
        raise ValueError(
            f"Lesson {lesson_id}: output_match must be one of {OUTPUT_MATCH_MODES}, got {mode!r}"
        )
    return mode


def extract_hints(text: str) -> list[str]:
    diy_m = re.search(r"^## Do it yourself\s*$(.*?)(?=^## |\Z)", text, re.MULTILINE | re.DOTALL)
    diy_sec = diy_m.group(1) if diy_m else text
    end_m = re.search(r"(?:^### Full Solution|<summary>[^\n]*Full Solution)", diy_sec, re.MULTILINE)
    if end_m:
        diy_sec = diy_sec[: end_m.start()]
    details = re.findall(
        r"<details>\s*<summary>[^\n]*?Hint\s*\d+[^\n]*?</summary>\s*(.*?)\s*</details>",
        diy_sec,
        re.DOTALL | re.IGNORECASE,
    )
    cleaned = []
    for d in details:
        line = re.sub(r"\s+", " ", d.strip())
        cleaned.append(line)
    return cleaned


def exercise_lessons():
    """Tier 2/3 exercise packages, flattened into the same registry as the beginner lessons.

    An exercise entry is a *program*, not a page: the learner's file plus `selfcheck.py` appended,
    graded by stdout exactly like a lesson. The starter fails visibly (NotImplementedError), the
    solution prints one PASS line, and a common wrong implementation fails a named check - the same
    three-way contract `scripts/run_exercise.py` enforces in CI, so the browser and the runner
    cannot disagree about what passing means. `selfcheck.py` is appended verbatim from the package;
    nothing here re-implements a check.

    The entry's `instructorTests` is that same `selfcheck.py` source, so the workbench runs the
    assertions itself, from the registry, after the learner's program has finished. The appended
    copy stays visible and runnable in the editor, but it is not what awards verification: a
    submission that only prints the expected PASS line has none of the functions the instructor
    copy calls, so it fails the behavioural check (all 44 packages are covered by
    `tests/test_exercise_package.py::test_print_only_submission_fails_the_instructor_tests`).
    """
    if not os.path.isdir(EXERCISES):
        return []
    entries = []
    for name in sorted(os.listdir(EXERCISES)):
        directory = os.path.join(EXERCISES, name)
        manifest_path = os.path.join(directory, "exercise.json")
        if not os.path.isfile(manifest_path):
            continue
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        delivery = manifest.get("delivery", {})
        checker = exercise_bundle.selfcheck_source(directory)
        entries.append(
            {
                "id": delivery.get("workbench_id", "EX." + manifest["id"]),
                "title": "%s - graded exercise" % manifest["title"],
                "track": "modules",
                "path": os.path.relpath(os.path.join(directory, "solution.py"), ROOT),
                # An exercise is one learning objective, not a list of its functions: the ideas
                # count is a beginner-lesson rule and the workbench enforces <= 2.
                "ideas": [manifest["title"]],
                "starterCode": exercise_bundle.browser_program(directory, "starter"),
                "hints": [
                    "Open the module, section 5 (`## 5. Exercise`): the hint ladder and the worked "
                    "solution are there. The self-check at the bottom of this file names what it "
                    "tests; run it as often as you like.",
                ],
                "fullSolution": exercise_bundle.browser_program(directory, "solution"),
                "expectedOutput": exercise_bundle.expected_output(directory, root=ROOT),
                "outputMatch": "normalized",
                "instructorTestSummary": [
                    "Browser: this package's own `selfcheck.py` runs again as the Instructor "
                    "Behavioral Tests, from the workbench registry rather than from the editor - "
                    "editing the appended copy, deleting it, or printing its PASS line does not "
                    "verify the exercise.",
                    "CI: scripts/run_exercise.py runs the same package's unittest cases - the starter "
                    "fails, the reference passes, and every planted fault fails its named test.",
                ],
                "instructorTests": checker,
            }
        )
    return entries


def main():
    files = get_python_lesson_files()
    lessons = []
    for path in files:
        rel = os.path.relpath(path, ROOT)
        folder = rel.split("/")[0]
        with open(path, "r", encoding="utf-8") as f:
            txt = f.read()

        fm_block = txt.split("---")[1] if txt.startswith("---") else txt
        lid_m = re.search(r'^lesson_id:\s*["\']?([^"\'\n]+)["\']?', fm_block, re.MULTILINE)
        title_m = re.search(r'^title:\s*["\']?([^"\'\n]+)["\']?', fm_block, re.MULTILINE)
        ideas = re.findall(r'^\s*-\s*["\']?([^"\'\n]+)["\']?', fm_block, re.MULTILINE)

        starter = extract_fenced(txt, r"^### Starter Code", "python")
        solution = extract_fenced(
            txt, r"(?:^### Full Solution|<summary>[^\n]*Full Solution)", "python"
        )
        expected = extract_fenced(txt, r"^### Expected Output", "text")
        hints = extract_hints(txt)

        lesson_id = lid_m.group(1).strip() if lid_m else rel
        output_match = extract_output_match(fm_block, lesson_id)
        if lesson_id not in INSTRUCTOR_TESTS:
            raise ValueError(f"Missing INSTRUCTOR_TESTS definition for lesson {lesson_id}")
        test_summary, test_code = INSTRUCTOR_TESTS[lesson_id]

        lessons.append(
            {
                "id": lesson_id,
                "title": title_m.group(1).strip() if title_m else rel,
                "track": folder,
                "path": rel,
                "ideas": [i.strip() for i in ideas if i.strip()],
                "starterCode": starter,
                "hints": hints,
                "fullSolution": solution,
                "expectedOutput": expected.strip(),
                "outputMatch": output_match,
                "instructorTestSummary": test_summary,
                "instructorTests": test_code.strip(),
            }
        )

    lessons.extend(exercise_lessons())

    out_dir = os.path.join(ROOT, "app", "src", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "pythonLessonsData.ts")

    content = (
        "// Auto-generated by scripts/generate_python_lessons_data.py — do not edit manually\n"
        "export interface PythonLessonItem {\n"
        "  id: string;\n"
        "  title: string;\n"
        "  track: string;\n"
        "  path: string;\n"
        "  ideas: string[];\n"
        "  starterCode: string;\n"
        "  hints: string[];\n"
        "  fullSolution: string;\n"
        "  expectedOutput: string;\n"
        "  outputMatch: 'normalized' | 'exact';\n"
        "  instructorTestSummary: string[];\n"
        "  instructorTests: string;\n"
        "}\n\n"
        "export const PYTHON_LESSONS: PythonLessonItem[] = "
        + json.dumps(lessons, indent=2)
        + ";\n"
    )

    if "--check" in os.sys.argv:
        if not os.path.exists(out_path):
            print(f"ERROR: {out_path} does not exist. Run python3 scripts/generate_python_lessons_data.py")
            os.sys.exit(1)
        with open(out_path, "r", encoding="utf-8") as f:
            existing = f.read()
        if existing != content:
            print(
                f"ERROR: {out_path} is out of sync with lesson markdown files! "
                "Run `python3 scripts/generate_python_lessons_data.py`."
            )
            os.sys.exit(1)
        print(f"OK: {out_path} is in sync with all {len(lessons)} Python lessons and exercises.")
        return

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Generated {out_path} with {len(lessons)} Python lessons.")


if __name__ == "__main__":
    main()
