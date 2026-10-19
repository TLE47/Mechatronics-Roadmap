#!/usr/bin/env python3
"""Tests for the shared plant, `resources/plants/mechalab_plant.py`.

Two jobs, in this order:

1. **Provenance.** The YAML is the documentation and the module is the executable model, so one test
   proves they agree value for value, and another proves every value is cited - a plant number with
   no lesson behind it is exactly the kind of invention this library exists to stop.
2. **Physics.** The plant is not a mock: it must reproduce the Tier 1 capstone's published numbers
   (0.0000 mm IK->FK, 2.40 mm peak / 0.91 mm RMS tracking error, 412 dropped frames at 115.2 kbaud)
   and satisfy the properties an exercise relies on (IK inverts FK, rest is a fixed point, the
   encoder quantises to one count, seeded noise reproduces).

Run: `python3 tests/test_plant.py` (also wired into the CI verify step).
"""

import contextlib
import io
import math
import os
import re
import sys
import unittest

# The plant is imported from `resources/plants/`, where a `__pycache__` would litter the repository -
# and where a stale `.pyc` can outlive an edit whose size and mtime-second are unchanged (copy a
# value over another and Python happily reuses the old bytecode). No bytecode, no such surprise.
sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANT_DIR = os.path.join(ROOT, "resources", "plants")
PLANT_YAML = os.path.join(PLANT_DIR, "tier1_arm_motor.yaml")
# The reference module is the template every later module copies, so what it publishes about the
# plant is asserted here: if the plant moves, that module is wrong and this fails.
REFERENCE_MODULE = os.path.join(ROOT, "modules", "02-mechanics.T2.02a.md")
PYTHON_BLOCK = re.compile(r"```python\n(.*?)```", re.DOTALL)
sys.path.insert(0, PLANT_DIR)

import mechalab_plant as plant  # noqa: E402  (path set up above)


def parse_flat_yaml(path):
    """Read the plant YAML: flat `dotted.key: number  # provenance` lines, comments and blanks."""
    values = {}
    provenance = {}
    with open(path, encoding="utf-8") as handle:
        for number, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            key, separator, rest = line.partition(":")
            if not separator:
                raise AssertionError("%s:%d is not a `key: value` line: %r" % (path, number, line))
            key = key.strip()
            value_text, _, comment = rest.partition("#")
            value_text = value_text.strip()
            try:
                value = float(value_text) if ("." in value_text or "e" in value_text) else int(value_text)
            except ValueError:
                raise AssertionError(
                    "%s:%d value %r is not a number - this file carries values, not prose"
                    % (path, number, value_text)
                )
            if key in values:
                raise AssertionError("%s:%d repeats the key %r" % (path, number, key))
            values[key] = value
            provenance[key] = comment.strip()
    return values, provenance


class TestPlantProvenance(unittest.TestCase):
    def setUp(self):
        self.yaml, self.comments = parse_flat_yaml(PLANT_YAML)

    def test_yaml_and_module_carry_the_same_values(self):
        self.assertEqual(
            set(self.yaml),
            set(plant.PLANT),
            f"expected the YAML and mechalab_plant.PLANT to carry the same keys; only in the "
            f"YAML: {sorted(set(self.yaml) - set(plant.PLANT))}, only in the module: "
            f"{sorted(set(plant.PLANT) - set(self.yaml))} - check a value was added to one "
            f"side only, since the two are meant to be one plant",
        )
        for key, value in sorted(self.yaml.items()):
            with self.subTest(key=key):
                self.assertEqual(
                    value,
                    plant.PLANT[key],
                    f"expected {key} to be {value!r} in both files, but the module says "
                    f"{plant.PLANT[key]!r}; check which side was edited, since every capstone "
                    f"number below is computed from the module's copy",
                )

    def test_every_value_cites_where_it_came_from(self):
        """No invented plant numbers: each row names a lesson, a stage or a bench measurement."""
        for key, comment in sorted(self.comments.items()):
            with self.subTest(key=key):
                self.assertTrue(
                    comment,
                    f"expected {key} to carry a provenance comment naming where the number came "
                    f"from; an uncited plant value is invented by definition - check the YAML's "
                    f"trailing comment",
                )
                self.assertRegex(
                    comment,
                    r"(\d\d\.\d|Lesson|Stage|Pass|capstone|worksheet|bench|datasheet|B\b)",
                    f"expected {key}'s comment to cite a lesson, stage, bench measurement or "
                    f"datasheet; got {comment!r} - check the wording, since a comment that "
                    f"names no source cannot be checked",
                )

    def test_no_value_is_a_placeholder(self):
        for key, value in sorted(plant.PLANT.items()):
            with self.subTest(key=key):
                self.assertIsInstance(
                    value, (int, float),
                    f"expected {key} to be a plain number, since this file carries values rather "
                    f"than prose; got {value!r} - check the YAML parsed as data",
                )
                self.assertNotIn(
                    key, ("TODO", "FIXME"),
                    "expected no TODO/FIXME key in the plant table; check the value was actually "
                    "measured or derived before shipping it to a capstone",
                )


class TestKinematics(unittest.TestCase):
    def test_ik_inverts_fk_across_the_workspace(self):
        for radius in (0.02, 0.05, 0.10, 0.15, 0.199):
            for angle in (0.0, 0.5, 1.0, 2.0, -1.0, -2.5):
                with self.subTest(radius=radius, angle=angle):
                    x, y = radius * math.cos(angle), radius * math.sin(angle)
                    q1, q2 = plant.ik(x, y)
                    x_back, y_back = plant.fk(q1, q2)
                    self.assertLess(
                        math.hypot(x - x_back, y - y_back), 1e-12,
                        f"expected fk(ik(x, y)) to return ({x:.6f}, {y:.6f}) within 1e-12 m at "
                        f"r={radius} theta={angle}; got ({x_back:.6f}, {y_back:.6f}) - check the "
                        f"elbow sign branch in ik",
                    )

    def test_reach_limit_is_exact_at_full_stretch(self):
        q1, q2 = plant.ik(plant.L1 + plant.L2, 0.0)
        self.assertAlmostEqual(
            q2, 0.0, places=9,
            msg=f"expected a fully stretched reach (r = L1+L2 = {plant.L1 + plant.L2:.4f} m) to "
                f"give q2 = 0 exactly; got {q2!r} - check the law-of-cosines term at its boundary",
        )
        self.assertAlmostEqual(
            q1, 0.0, places=9,
            msg=f"expected a straight-ahead reach to give q1 = 0; got {q1!r} - check the shoulder "
                f"angle uses atan2(y, x) rather than the elbow's orientation term",
        )

    def test_target_outside_the_workspace_raises_with_the_reach_in_the_message(self):
        with self.assertRaises(ValueError) as caught:
            plant.ik(0.25, 0.0)
        self.assertIn(
            "0.2000 m", str(caught.exception),
            f"expected the out-of-reach refusal to state the plant's own reach (0.2000 m) so the "
            f"learner can see the target against it; got {str(caught.exception)!r} - check the "
            f"message in ik",
        )

    def test_gravity_holding_torque_matches_the_capstone_numbers(self):
        tau_g1, tau_g2 = plant.gravity_torque(0.0, 0.0)
        self.assertAlmostEqual(
            tau_g1, 0.3188, places=4,
            msg=f"expected the shoulder's horizontal holding torque to be 0.3188 N.m, the "
                f"capstone's published figure; got {tau_g1!r} - check (m1*lc1 + m2*l1 + m2*lc2)*g",
        )
        self.assertAlmostEqual(
            tau_g2, 0.0736, places=4,
            msg=f"expected the elbow's horizontal holding torque to be 0.0736 N.m; got {tau_g2!r} "
                f"- check that the elbow sees only link 2's own moment arm",
        )
        self.assertGreater(
            tau_g1, 4.0 * tau_g2,
            f"expected the shoulder to hold at least four times the elbow's torque, since both "
            f"links hang off it; got {tau_g1!r} against {tau_g2!r} - check the moment arms in "
            f"gravity_torque",
        )

    def test_wrap_pi_is_bounded_and_preserves_cos_sin(self):
        for angle in (0.0, 3.0, math.pi, -3.5, 12.0, -20.0):
            with self.subTest(angle=angle):
                wrapped = plant.wrap_pi(angle)
                self.assertGreater(
                    wrapped, -math.pi - 1e-12,
                    f"expected wrap_pi({angle}) to land strictly above -pi; got {wrapped!r} - "
                    f"check the branch cut is exclusive at the bottom",
                )
                self.assertLessEqual(
                    wrapped, math.pi + 1e-12,
                    f"expected wrap_pi({angle}) to land at or below +pi; got {wrapped!r} - check "
                    f"the branch cut is inclusive at the top",
                )
                self.assertAlmostEqual(
                    math.cos(wrapped), math.cos(angle), places=12,
                    msg=f"expected wrapping {angle} to leave the cosine unchanged; cos gave "
                        f"{math.cos(wrapped)!r} against {math.cos(angle)!r} - check the shift is a "
                        f"whole number of turns",
                )
                self.assertAlmostEqual(
                    math.sin(wrapped), math.sin(angle), places=12,
                    msg=f"expected wrapping {angle} to leave the sine unchanged; sin gave "
                        f"{math.sin(wrapped)!r} against {math.sin(angle)!r} - a sign flip here "
                        f"means the angle was reflected rather than wrapped",
                )


class TestJointDynamics(unittest.TestCase):
    def test_rest_is_a_fixed_point_with_no_torque_and_no_gravity(self):
        state = (0.3, -0.2, 0.0, 0.0)
        for _ in range(50):
            state = plant.step_arm(state, (0.0, 0.0), gravity=False)
        self.assertEqual(
            state, (0.3, -0.2, 0.0, 0.0),
            f"expected a torqueless, gravity-free step to leave the arm exactly where it was for "
            f"50 steps; got {state!r} - check for a stray forcing term or a wrongly signed damping",
        )

    def test_free_damping_decays_by_the_exact_geometric_factor(self):
        """Explicit Euler has a closed form here, so this asserts an identity, not a tolerance."""
        dq1 = 1.0
        state = (0.0, 0.0, dq1, 0.0)
        factor = 1.0 - plant.B1 * plant.DT / plant.I1
        for step in range(1, 11):
            state = plant.step_arm(state, (0.0, 0.0), gravity=False)
            self.assertAlmostEqual(
                state[2], dq1 * factor**step, places=15,
                msg=f"expected the free damping to decay by the exact geometric factor "
                    f"{factor!r} after {step} step(s), i.e. {dq1 * factor**step!r}; got "
                    f"{state[2]!r} - check the explicit-Euler update (1 - B1*DT/I1)",
            )

    def test_a_constant_torque_reaches_the_expected_steady_speed(self):
        """tau = b * dq at the top speed, so the terminal speed is tau / b."""
        tau = (0.10, 0.04)
        state = (0.0, 0.0, 0.0, 0.0)
        for _ in range(4000):
            state = plant.step_arm(state, tau, gravity=False)
        self.assertAlmostEqual(
            state[2], tau[0] / plant.B1, places=6,
            msg=f"expected joint 1 to settle at tau/B1 = {tau[0] / plant.B1!r} rad/s, where the "
                f"torque balances damping; got {state[2]!r} - check B1 and that the run is long "
                f"enough to converge",
        )
        self.assertAlmostEqual(
            state[3], tau[1] / plant.B2, places=6,
            msg=f"expected joint 2 to settle at tau/B2 = {tau[1] / plant.B2!r} rad/s; got "
                f"{state[3]!r} - check B2, since a swapped damping constant still looks stable",
        )

    def test_torque_is_clamped_to_the_actuator_limit(self):
        tau = plant.pd_gravity_torque((0.0, 0.0), (0.0, 0.0), (10.0, 10.0), (0.0, 0.0))
        self.assertEqual(
            tau, (plant.TAU_LIMIT, plant.TAU_LIMIT),
            f"expected a +10 rad position error to saturate both joints at +{plant.TAU_LIMIT} "
            f"N.m; got {tau!r} - check the clamp is applied after the gravity term is added",
        )
        tau = plant.pd_gravity_torque((0.0, 0.0), (0.0, 0.0), (-10.0, -10.0), (0.0, 0.0))
        self.assertEqual(
            tau, (-plant.TAU_LIMIT, -plant.TAU_LIMIT),
            f"expected a -10 rad error to saturate both joints at -{plant.TAU_LIMIT} N.m; got "
            f"{tau!r} - check the clamp is symmetric, since a one-sided limit stalls the arm",
        )


class TestCapstoneRun(unittest.TestCase):
    """The plant has to reproduce the numbers the Tier 1 capstone publishes, or it is a different
    plant wearing the same name."""

    def setUp(self):
        self.run = plant.simulate_arm()

    def test_ik_fk_round_trip_is_exact_along_the_trajectory(self):
        self.assertLess(
            self.run["max_ik_fk_err_mm"], 1e-6,
            f"expected the run's worst ik/fk round-trip error to stay under 1e-6 mm, the value "
            f"the capstone prints as 0.0000; got {self.run['max_ik_fk_err_mm']!r} - check ik's "
            f"elbow branch, since a round-trip error is pure algebra, not dynamics",
        )

    def test_tracking_error_matches_the_capstone(self):
        self.assertAlmostEqual(
            self.run["max_dyn_err_mm"], 2.40, delta=0.01,
            msg=f"expected the peak tracking error to match the capstone's 2.40 mm; got "
                f"{self.run['max_dyn_err_mm']!r} - check the controller gains and DT, which move "
                f"this figure directly",
        )
        self.assertAlmostEqual(
            self.run["rms_dyn_err_mm"], 0.91, delta=0.005,
            msg=f"expected the RMS tracking error to match the capstone's 0.91 mm; got "
                f"{self.run['rms_dyn_err_mm']!r} - check the run length, since a truncated run "
                f"moves the RMS but not the peak",
        )

    def test_the_pulse_is_what_costs_the_accuracy_inside_its_own_window(self):
        """The peak error over the whole run comes from the trajectory's own acceleration lag, so the
        pulse shows up in the window it acts in - comparing whole-run peaks would prove nothing."""

        def worst_inside_the_pulse(run):
            return max(
                math.hypot(xd - x_act, yd - y_act) * 1000.0
                for t_s, xd, yd, x_act, y_act, _, _ in run["trace"]
                if plant.DIST_START_S <= t_s < plant.DIST_END_S
            )

        disturbed = self.run if self.run["trace"] else plant.simulate_arm(record=True)
        quiet = plant.simulate_arm(record=True, disturbance=False)
        self.assertGreater(
            worst_inside_the_pulse(disturbed), worst_inside_the_pulse(quiet) + 0.05,
            f"expected the pulse window to be measurably worse with the disturbance on "
            f"({worst_inside_the_pulse(disturbed):.3f} mm) than off "
            f"({worst_inside_the_pulse(quiet):.3f} mm); a tie means DIST_START_S/DIST_END_S "
            f"no longer bracket the pulse",
        )

    def test_a_controller_that_returns_no_torque_lets_the_arm_sag(self):
        """Proves `controller` is really in the loop: a broken hook would look perfect."""
        sagging = plant.simulate_arm(controller=lambda q, dq, q_d, dqd: (0.0, 0.0))
        self.assertGreater(
            sagging["max_dyn_err_mm"], 10.0,
            f"expected a controller that returns no torque to let the arm sag past 10 mm; got "
            f"{sagging['max_dyn_err_mm']!r} - if it still tracks, the controller hook is ignored "
            f"and every number above is computed from a fixed law",
        )

    def test_record_gives_one_row_per_tick(self):
        recorded = plant.simulate_arm(steps=10, record=True)
        self.assertEqual(
            len(recorded["trace"]), 10,
            f"expected one trace row per tick for a 10-step run; got "
            f"{len(recorded['trace'])} - check the row is appended inside the loop, not once",
        )
        self.assertEqual(
            len(recorded["trace"][0]), 7,
            f"expected each row to carry 7 fields (t, xd, yd, x, y, tau1, tau2); got "
            f"{len(recorded['trace'][0])} - the plotting helper unpacks this row positionally",
        )


class TestSensing(unittest.TestCase):
    def test_encoder_quantises_to_within_one_count(self):
        lsb = 2.0 * math.pi / plant.ENCODER_CPR
        for turn_fraction in (0.0, 0.25, 0.5, 0.75, 0.999):
            with self.subTest(turn_fraction=turn_fraction):
                angle = turn_fraction * 2.0 * math.pi
                counts = plant.encoder_counts(angle)
                self.assertGreaterEqual(
                    counts, 0,
                    f"expected a non-negative count at {turn_fraction:.3f} of a turn; got "
                    f"{counts} - check the modulo, which must land in [0, CPR)",
                )
                self.assertLess(
                    counts, plant.ENCODER_CPR,
                    f"expected a count below the {plant.ENCODER_CPR}-count range at "
                    f"{turn_fraction:.3f} of a turn; got {counts} - the wrap is off by one",
                )
                self.assertLessEqual(
                    abs(plant.wrap_pi(plant.counts_to_rad(counts) - angle)), lsb / 2 + 1e-12,
                    f"expected the quantisation error at {turn_fraction:.3f} of a turn to stay "
                    f"within half a count (lsb/2 = {lsb / 2!r} rad); got "
                    f"{abs(plant.wrap_pi(plant.counts_to_rad(counts) - angle))!r} - check "
                    f"counts_to_rad uses the same CPR as encoder_counts",
                )

    def test_encoder_wraps_negative_and_multi_turn_angles(self):
        self.assertEqual(
            plant.encoder_counts(-2.0 * math.pi), 0,
            f"expected a negative full turn to wrap to count 0; got "
            f"{plant.encoder_counts(-2.0 * math.pi)} - check the modulo is floored, not truncated",
        )
        self.assertEqual(
            plant.encoder_counts(4.0 * math.pi), 0,
            f"expected two whole turns to wrap to count 0; got "
            f"{plant.encoder_counts(4.0 * math.pi)} - check multi-turn angles are reduced",
        )
        self.assertEqual(
            plant.encoder_counts(0.0), plant.encoder_counts(2.0 * math.pi),
            f"expected 0 and 2*pi to give the same count ({plant.encoder_counts(0.0)}); got "
            f"{plant.encoder_counts(2.0 * math.pi)} - a full turn must be one revolution, not one "
            f"count past it",
        )

    def test_seeded_noise_reproduces_exactly(self):
        first = plant.add_noise([0.0, 0.0, 0.0], 0.01, seed=7)
        second = plant.add_noise([0.0, 0.0, 0.0], 0.01, seed=7)
        other = plant.add_noise([0.0, 0.0, 0.0], 0.01, seed=8)
        self.assertEqual(
            first, second,
            f"expected seed 7 to reproduce the same three samples on a second call; got "
            f"{first!r} then {second!r} - check the RNG is built from the seed each call rather "
            f"than drawn from a module-level generator",
        )
        self.assertNotEqual(
            first, other,
            f"expected seed 8 to differ from seed 7; both gave {first!r} - a fixed draw would "
            f"make every 'seeded noise' experiment in the course identical",
        )

    def test_zero_noise_is_an_identity(self):
        values = [1.0, -2.0, 3.5]
        self.assertEqual(
            plant.add_noise(values, 0.0), values,
            f"expected zero sigma to return the input unchanged; got "
            f"{plant.add_noise(values, 0.0)!r} - check the early return, since a stray draw here "
            f"would add noise to every noise-free experiment",
        )

    def test_noise_standard_deviation_is_the_one_requested(self):
        samples = plant.add_noise([0.0] * 20000, 0.5, seed=1234)
        mean = sum(samples) / len(samples)
        variance = sum((s - mean) ** 2 for s in samples) / (len(samples) - 1)
        self.assertLess(
            abs(mean), 0.02,
            f"expected the sample mean of 20000 draws at sigma 0.5 to sit near zero (|mean| < "
            f"0.02); got {mean!r} - a biased mean means the noise is added, not drawn",
        )
        self.assertAlmostEqual(
            math.sqrt(variance), 0.5, delta=0.02,
            msg=f"expected the sample standard deviation to be the requested 0.5; got "
                f"{math.sqrt(variance)!r} - check that sigma is passed as the standard deviation "
                f"rather than as a variance",
        )


class TestTelemetry(unittest.TestCase):
    def test_crc8_matches_the_published_check_value(self):
        """CRC-8/SMBus (poly 0x07, init 0x00) over "123456789" is 0xF4 - an outside check vector."""
        self.assertEqual(
            plant.crc8_ccitt(b"123456789"), 0xF4,
            f"expected CRC-8/SMBus (poly 0x07, init 0x00) over '123456789' to be 0xF4, the "
            f"published check vector; got {plant.crc8_ccitt(b'123456789'):#04x} - check the "
            f"polynomial and that the high bit is tested before the shift",
        )
        self.assertEqual(
            plant.crc8_ccitt(b""), 0x00,
            f"expected the empty frame to checksum to the init value 0x00; got "
            f"{plant.crc8_ccitt(b''):#04x} - check the loop leaves the initial value alone",
        )

    def test_uart_budget_reproduces_the_capstone_drop_counts(self):
        self.assertEqual(
            plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT, plant.BAUD_OVERFLOWS),
            412,
            f"expected {plant.TICKS} frames of {plant.FRAME_BYTES} bytes at "
            f"{plant.BAUD_OVERFLOWS} baud over a {plant.TICKS * plant.DT:.2f} s run to overrun "
            f"412 times, the capstone's count; a different number means the frame time or the "
            f"run length changed",
        )
        self.assertEqual(
            plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT, plant.BAUD_FITS), 0,
            f"expected no overruns at a baud that fits the frame in one {plant.DT:.6f} s tick; a "
            f"nonzero count means the budget comparison is stricter than the link",
        )


class TestMotorTool(unittest.TestCase):
    def test_motor_requires_its_bench_measurements(self):
        """No invented motor constants: the signature refuses to guess them."""
        with self.assertRaises(TypeError):
            plant.simulate_motor(12.0)

    def test_motor_reaches_the_analytic_steady_state_speed(self):
        voltage, resistance, inductance = 12.0, 10.0, 0.05  # L/R = 5 ms, so dt = 1 ms is stable
        kt = ke = 0.05
        inertia, damping, load = 2.0e-5, 1.0e-3, 5.0e-4  # J/b = 20 ms
        expected = (kt * voltage / resistance - load) / (damping + kt * ke / resistance)
        run = plant.simulate_motor(
            voltage,
            resistance,
            inductance,
            kt,
            ke,
            inertia,
            damping,
            dt=0.001,
            steps=5000,
            load_torque=load,
        )
        self.assertAlmostEqual(
            run["speed_rad_s"], expected, delta=0.01 * abs(expected),
            msg=f"expected the motor to settle at the analytic (kt*V/R - load)/(b + kt*ke/R) = "
                f"{expected!r} rad/s within 1%; got {run['speed_rad_s']!r} - check the back-EMF "
                f"term, which sets this speed",
        )

    def test_motor_refuses_a_dt_its_integrator_cannot_handle(self):
        """A silent nan is worse than a refusal, and the limit is a teachable number."""
        with self.assertRaises(ValueError) as caught:
            plant.simulate_motor(12.0, 10.0, 0.001, 0.05, 0.05, 2.0e-5, 1.0e-3, steps=10)
        self.assertIn(
            "2*L/R", str(caught.exception),
            f"expected the unstable-dt refusal to name the electrical limit 2*L/R so the learner "
            f"can size their own dt; got {str(caught.exception)!r}",
        )
        with self.assertRaises(ValueError) as caught:
            # Stable electrically (2*L/R = 10 ms) but the mechanical pole needs dt < 2*J/b = 0.2 ms.
            plant.simulate_motor(12.0, 10.0, 0.05, 0.05, 0.05, 1.0e-6, 1.0e-2, dt=0.001, steps=10)
        self.assertIn(
            "2*J/b", str(caught.exception),
            f"expected the mechanically-unstable-dt refusal to name 2*J/b, which is the binding "
            f"limit here (electrically stable at 2*L/R = 10 ms); got {str(caught.exception)!r}",
        )

    def test_motor_records_a_trace_when_asked(self):
        run = plant.simulate_motor(6.0, 10.0, 0.05, 0.05, 0.05, 2.0e-5, 1.0e-3, steps=7, record=True)
        self.assertEqual(
            len(run["trace"]), 7,
            f"expected one trace row per step for a 7-step motor run; got {len(run['trace'])} - "
            f"check record=True is honoured rather than returning the final state alone",
        )


def reference_module_text():
    with open(REFERENCE_MODULE, encoding="utf-8") as handle:
        return handle.read()


def elbow_frame_gravity(q1, q2):
    """The section 5 fault, exactly as the module injects it: the elbow link's angle measured in
    its own frame (`cos q2`) where the world frame (`cos(q1 + q2)`) belongs."""
    s1, c1 = math.sin(q1), math.cos(q1)
    s2, c2 = math.sin(q2), math.cos(q2)
    com_jacobians = (
        ([[-plant.LC1 * s1, 0.0], [plant.LC1 * c1, 0.0]], plant.M1),
        ([[-plant.L1 * s1 - plant.LC2 * s2, -plant.LC2 * s2],
          [plant.L1 * c1 + plant.LC2 * c2, plant.LC2 * c2]], plant.M2),
    )
    tau1 = 0.0
    tau2 = 0.0
    for J_com, mass in com_jacobians:
        tau1 += J_com[0][0] * 0.0 + J_com[1][0] * mass * plant.G
        tau2 += J_com[0][1] * 0.0 + J_com[1][1] * mass * plant.G
    return tau1, tau2


def elbow_frame_controller(q, dq, q_des, dq_des):
    """The plant's shipped law with the fault above replacing its gravity feedforward."""
    tau_g = elbow_frame_gravity(q[0], q[1])
    tau1 = plant.KP1 * (q_des[0] - q[0]) + plant.KD1 * (dq_des[0] - dq[0]) + tau_g[0]
    tau2 = plant.KP2 * (q_des[1] - q[1]) + plant.KD2 * (dq_des[1] - dq[1]) + tau_g[1]
    return (
        max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau1)),
        max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau2)),
    )


class TestReferenceModuleClaims(unittest.TestCase):
    """Every number the reference module states about this arm has to be reproducible now.

    `scripts/validate_modules.py` already executes the module's worked example and diffs its output,
    but it does not diff the exercise, the transfer run or the Break-it symptoms - and those are
    published claims too. This class recomputes them from the plant and checks the module still
    writes the same numbers, so the template cannot quietly drift away from the model it teaches.
    """

    def test_the_quoted_arm_values_are_the_plants(self):
        text = reference_module_text()
        for fragment in (
            "L1 = L2 = %.2f m" % plant.L1,
            "m1 = %.2f kg" % plant.M1,
            "m2 = %.2f kg" % plant.M2,
            "import mechalab_plant",
        ):
            with self.subTest(fragment=fragment):
                self.assertIn(
                    fragment, text,
                    f"expected the reference module to still state {fragment!r}; the page teaches "
                    f"these values, so check whether the plant was retuned or the prose drifted "
                    f"from it - the two must be edited together",
                )

    def test_the_rod_ratio_the_module_publishes_is_the_plants(self):
        rod_about_its_end = plant.M2 * plant.L2 ** 2 / 3.0
        self.assertAlmostEqual(
            plant.I2 / rod_about_its_end, 6.0, places=9,
            msg=f"expected the plant's I2 to be 6.0 x a uniform rod about its end "
                f"({rod_about_its_end!r}); got {plant.I2 / rod_about_its_end!r} - the module "
                f"publishes this ratio, and a 1/12-about-centre inertia would read 2.0",
        )
        self.assertIn(
            "I2 = 6.0 x rod", reference_module_text(),
            f"expected the module to print the published ratio 'I2 = 6.0 x rod'; check the page "
            f"text against the plant, which is what the assertion above proves",
        )

    def test_the_elbow_frame_fault_reproduces_the_published_symptoms(self):
        text = reference_module_text()

        invented = elbow_frame_gravity(math.pi / 2.0, 0.0)[1]          # the vertical pose needs none
        self.assertAlmostEqual(
            invented, 0.0736, places=4,
            msg=f"expected the elbow-frame fault to invent 0.0736 N.m at the vertical pose, where "
                f"the true gravity torque is zero; got {invented!r} - check the fault reads "
                f"cos(q2) where the world frame needs cos(q1+q2)",
        )
        self.assertIn(
            "0.0736", text,
            f"expected the module's Break-it section to quote the fault's invented 0.0736 N.m; "
            f"check the symptom table against the fault's own output",
        )

        hold = (math.pi / 2.0, 0.0)
        state = (hold[0], hold[1], 0.0, 0.0)
        for _ in range(4000):
            state = plant.step_arm(
                state, elbow_frame_controller((state[0], state[1]), (state[2], state[3]), hold, (0.0, 0.0))
            )
        self.assertAlmostEqual(
            math.degrees(state[1] - hold[1]), 0.3549, places=3,
            msg=f"expected the faulty controller to hold the elbow 0.3549 deg off its pose after "
                f"4000 ticks; got {math.degrees(state[1] - hold[1])!r} - check the injected "
                f"gravity term and the run length",
        )
        self.assertIn(
            "0.3549", text,
            f"expected the module to publish the 0.3549 deg steady-state offset the fault causes; "
            f"check the Break-it table against the run above",
        )

        run = plant.simulate_arm(controller=elbow_frame_controller)
        self.assertAlmostEqual(
            run["rms_dyn_err_mm"], 1.43, delta=0.01,
            msg=f"expected the elbow-frame fault to raise the RMS error to 1.43 mm from the "
                f"healthy 0.91 mm; got {run['rms_dyn_err_mm']!r} - check the fault is injected "
                f"into the controller, not the plant",
        )
        self.assertIn(
            "1.43", text,
            f"expected the module to publish the 1.43 mm RMS the fault produces; check the "
            f"Break-it table against the run above",
        )

        worst = 0.0
        for step in range(plant.TICKS):
            q1_d, q2_d = plant.ik(*plant.figure8_target(step * plant.DT))
            bad = elbow_frame_gravity(q1_d, q2_d)
            good = plant.gravity_torque(q1_d, q2_d)
            worst = max(worst, abs(bad[0] - good[0]), abs(bad[1] - good[1]))
        self.assertAlmostEqual(
            worst, 0.0677, delta=1e-3,
            msg=f"expected the worst torque the elbow-frame fault adds along the figure-eight to "
                f"be 0.0677 N.m; got {worst!r} - check the fault's cos q2 mixing against the "
                f"world-frame torque along the whole trajectory",
        )
        self.assertIn(
            "0.0677", text,
            f"expected the module to publish the 0.0677 N.m worst-case torque error; check the "
            f"Break-it table against the sweep above",
        )

    def test_the_transfer_block_prints_the_numbers_the_module_publishes(self):
        """Run the module's own transfer code and require the output it claims, so a payload claim
        cannot be edited (or the plant changed) without one of the two failing here."""
        blocks = [block for block in PYTHON_BLOCK.findall(reference_module_text()) if "run_with_payload" in block]
        self.assertEqual(
            len(blocks), 1,
            f"expected exactly one module block calling run_with_payload, found {len(blocks)}; "
            f"check the page still prints its payload experiment, since zero blocks means the "
            f"published numbers below are no longer reproduced here",
        )
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            exec(blocks[0], {})
        printed = captured.getvalue()
        for expected in ("0.20 kg payload | J^T feedforward on : RMS=0.91 mm, peak=2.40 mm",
                         "0.20 kg payload | J^T feedforward off: RMS=3.59 mm, peak=5.41 mm"):
            self.assertIn(
                expected, printed,
                f"expected the module's transfer block to print {expected!r}; the block ran, so "
                f"the plant returned different numbers - check whether the model was retuned "
                f"without the page's published claims being updated. Output was:\n{printed}",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
