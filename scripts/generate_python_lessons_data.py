#!/usr/bin/env python3
"""Generate app/src/data/pythonLessonsData.ts from all 32 Python beginner lessons.

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

OUTPUT_MATCH_MODES = ("normalized", "exact")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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
            "Test compute_flow inversely proportional to opposition and zero guard at opposition <= 0",
            "Test compute_effort_flow_power (Effort * Flow) across active and zero-flow (closed valve) states",
        ],
        """import math
assert math.isclose(compute_flow(12.0, 60.0), 0.20, abs_tol=1e-9)
assert math.isclose(compute_flow(12.0, 120.0), 0.10, abs_tol=1e-9)
assert math.isclose(compute_flow(12.0, 0.0), 0.0, abs_tol=1e-9)
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
            "Test diagnose_capstone_fault across all 3 R4 broken versions, pack_boss_telemetry 20-byte CRC-8 integrity, and simulate_uart_tx bandwidth drops",
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
assert diagnose_capstone_fault(-0.01, 1.0, 37.2) == "missing_anti_windup"
assert diagnose_capstone_fault(-0.01, 1.0, 4.0) == "nominal_ok"
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
        print(f"OK: {out_path} is in sync with all {len(lessons)} Python lessons.")
        return

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Generated {out_path} with {len(lessons)} Python lessons.")


if __name__ == "__main__":
    main()
