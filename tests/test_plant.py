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

import math
import os
import sys
import unittest

# The plant is imported from `resources/plants/`, where a `__pycache__` would litter the repository -
# and where a stale `.pyc` can outlive an edit whose size and mtime-second are unchanged (copy a
# value over another and Python happily reuses the old bytecode). No bytecode, no such surprise.
sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANT_DIR = os.path.join(ROOT, "resources", "plants")
PLANT_YAML = os.path.join(PLANT_DIR, "tier1_arm_motor.yaml")
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
            "keys differ between tier1_arm_motor.yaml and mechalab_plant.PLANT",
        )
        for key, value in sorted(self.yaml.items()):
            with self.subTest(key=key):
                self.assertEqual(
                    value,
                    plant.PLANT[key],
                    "%s is %r in the YAML and %r in the module" % (key, value, plant.PLANT[key]),
                )

    def test_every_value_cites_where_it_came_from(self):
        """No invented plant numbers: each row names a lesson, a stage or a bench measurement."""
        for key, comment in sorted(self.comments.items()):
            with self.subTest(key=key):
                self.assertTrue(comment, "%s has no provenance comment" % key)
                self.assertRegex(
                    comment,
                    r"(\d\d\.\d|Lesson|Stage|Pass|capstone|worksheet|bench|datasheet|B\b)",
                    "%s cites nothing recognisable as a source: %r" % (key, comment),
                )

    def test_no_value_is_a_placeholder(self):
        for key, value in sorted(plant.PLANT.items()):
            with self.subTest(key=key):
                self.assertIsInstance(value, (int, float))
                self.assertNotIn(key, ("TODO", "FIXME"))


class TestKinematics(unittest.TestCase):
    def test_ik_inverts_fk_across_the_workspace(self):
        for radius in (0.02, 0.05, 0.10, 0.15, 0.199):
            for angle in (0.0, 0.5, 1.0, 2.0, -1.0, -2.5):
                with self.subTest(radius=radius, angle=angle):
                    x, y = radius * math.cos(angle), radius * math.sin(angle)
                    q1, q2 = plant.ik(x, y)
                    x_back, y_back = plant.fk(q1, q2)
                    self.assertLess(math.hypot(x - x_back, y - y_back), 1e-12)

    def test_reach_limit_is_exact_at_full_stretch(self):
        q1, q2 = plant.ik(plant.L1 + plant.L2, 0.0)
        self.assertAlmostEqual(q2, 0.0, places=9)
        self.assertAlmostEqual(q1, 0.0, places=9)

    def test_target_outside_the_workspace_raises_with_the_reach_in_the_message(self):
        with self.assertRaises(ValueError) as caught:
            plant.ik(0.25, 0.0)
        self.assertIn("0.2000 m", str(caught.exception))

    def test_gravity_holding_torque_matches_the_capstone_numbers(self):
        tau_g1, tau_g2 = plant.gravity_torque(0.0, 0.0)
        self.assertAlmostEqual(tau_g1, 0.3188, places=4)
        self.assertAlmostEqual(tau_g2, 0.0736, places=4)
        self.assertGreater(tau_g1, 4.0 * tau_g2, "the shoulder holds both links, the elbow only one")

    def test_wrap_pi_is_bounded_and_preserves_cos_sin(self):
        for angle in (0.0, 3.0, math.pi, -3.5, 12.0, -20.0):
            with self.subTest(angle=angle):
                wrapped = plant.wrap_pi(angle)
                self.assertGreater(wrapped, -math.pi - 1e-12)
                self.assertLessEqual(wrapped, math.pi + 1e-12)
                self.assertAlmostEqual(math.cos(wrapped), math.cos(angle), places=12)
                self.assertAlmostEqual(math.sin(wrapped), math.sin(angle), places=12)


class TestJointDynamics(unittest.TestCase):
    def test_rest_is_a_fixed_point_with_no_torque_and_no_gravity(self):
        state = (0.3, -0.2, 0.0, 0.0)
        for _ in range(50):
            state = plant.step_arm(state, (0.0, 0.0), gravity=False)
        self.assertEqual(state, (0.3, -0.2, 0.0, 0.0))

    def test_free_damping_decays_by_the_exact_geometric_factor(self):
        """Explicit Euler has a closed form here, so this asserts an identity, not a tolerance."""
        dq1 = 1.0
        state = (0.0, 0.0, dq1, 0.0)
        factor = 1.0 - plant.B1 * plant.DT / plant.I1
        for step in range(1, 11):
            state = plant.step_arm(state, (0.0, 0.0), gravity=False)
            self.assertAlmostEqual(state[2], dq1 * factor**step, places=15)

    def test_a_constant_torque_reaches_the_expected_steady_speed(self):
        """tau = b * dq at the top speed, so the terminal speed is tau / b."""
        tau = (0.10, 0.04)
        state = (0.0, 0.0, 0.0, 0.0)
        for _ in range(4000):
            state = plant.step_arm(state, tau, gravity=False)
        self.assertAlmostEqual(state[2], tau[0] / plant.B1, places=6)
        self.assertAlmostEqual(state[3], tau[1] / plant.B2, places=6)

    def test_torque_is_clamped_to_the_actuator_limit(self):
        tau = plant.pd_gravity_torque((0.0, 0.0), (0.0, 0.0), (10.0, 10.0), (0.0, 0.0))
        self.assertEqual(tau, (plant.TAU_LIMIT, plant.TAU_LIMIT))
        tau = plant.pd_gravity_torque((0.0, 0.0), (0.0, 0.0), (-10.0, -10.0), (0.0, 0.0))
        self.assertEqual(tau, (-plant.TAU_LIMIT, -plant.TAU_LIMIT))


class TestCapstoneRun(unittest.TestCase):
    """The plant has to reproduce the numbers the Tier 1 capstone publishes, or it is a different
    plant wearing the same name."""

    def setUp(self):
        self.run = plant.simulate_arm()

    def test_ik_fk_round_trip_is_exact_along_the_trajectory(self):
        self.assertLess(self.run["max_ik_fk_err_mm"], 1e-6, "capstone prints 0.0000 mm")

    def test_tracking_error_matches_the_capstone(self):
        self.assertAlmostEqual(self.run["max_dyn_err_mm"], 2.40, delta=0.01)
        self.assertAlmostEqual(self.run["rms_dyn_err_mm"], 0.91, delta=0.005)

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
        self.assertGreater(worst_inside_the_pulse(disturbed), worst_inside_the_pulse(quiet) + 0.05)

    def test_a_controller_that_returns_no_torque_lets_the_arm_sag(self):
        """Proves `controller` is really in the loop: a broken hook would look perfect."""
        sagging = plant.simulate_arm(controller=lambda q, dq, q_d, dqd: (0.0, 0.0))
        self.assertGreater(sagging["max_dyn_err_mm"], 10.0)

    def test_record_gives_one_row_per_tick(self):
        recorded = plant.simulate_arm(steps=10, record=True)
        self.assertEqual(len(recorded["trace"]), 10)
        self.assertEqual(len(recorded["trace"][0]), 7)


class TestSensing(unittest.TestCase):
    def test_encoder_quantises_to_within_one_count(self):
        lsb = 2.0 * math.pi / plant.ENCODER_CPR
        for turn_fraction in (0.0, 0.25, 0.5, 0.75, 0.999):
            with self.subTest(turn_fraction=turn_fraction):
                angle = turn_fraction * 2.0 * math.pi
                counts = plant.encoder_counts(angle)
                self.assertGreaterEqual(counts, 0)
                self.assertLess(counts, plant.ENCODER_CPR)
                self.assertLessEqual(abs(plant.wrap_pi(plant.counts_to_rad(counts) - angle)), lsb / 2 + 1e-12)

    def test_encoder_wraps_negative_and_multi_turn_angles(self):
        self.assertEqual(plant.encoder_counts(-2.0 * math.pi), 0)
        self.assertEqual(plant.encoder_counts(4.0 * math.pi), 0)
        self.assertEqual(plant.encoder_counts(0.0), plant.encoder_counts(2.0 * math.pi))

    def test_seeded_noise_reproduces_exactly(self):
        first = plant.add_noise([0.0, 0.0, 0.0], 0.01, seed=7)
        second = plant.add_noise([0.0, 0.0, 0.0], 0.01, seed=7)
        other = plant.add_noise([0.0, 0.0, 0.0], 0.01, seed=8)
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)

    def test_zero_noise_is_an_identity(self):
        values = [1.0, -2.0, 3.5]
        self.assertEqual(plant.add_noise(values, 0.0), values)

    def test_noise_standard_deviation_is_the_one_requested(self):
        samples = plant.add_noise([0.0] * 20000, 0.5, seed=1234)
        mean = sum(samples) / len(samples)
        variance = sum((s - mean) ** 2 for s in samples) / (len(samples) - 1)
        self.assertLess(abs(mean), 0.02)
        self.assertAlmostEqual(math.sqrt(variance), 0.5, delta=0.02)


class TestTelemetry(unittest.TestCase):
    def test_crc8_matches_the_published_check_value(self):
        """CRC-8/SMBus (poly 0x07, init 0x00) over "123456789" is 0xF4 - an outside check vector."""
        self.assertEqual(plant.crc8_ccitt(b"123456789"), 0xF4)
        self.assertEqual(plant.crc8_ccitt(b""), 0x00)

    def test_uart_budget_reproduces_the_capstone_drop_counts(self):
        self.assertEqual(plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT, plant.BAUD_OVERFLOWS), 412)
        self.assertEqual(plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT, plant.BAUD_FITS), 0)


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
        self.assertAlmostEqual(run["speed_rad_s"], expected, delta=0.01 * abs(expected))

    def test_motor_refuses_a_dt_its_integrator_cannot_handle(self):
        """A silent nan is worse than a refusal, and the limit is a teachable number."""
        with self.assertRaises(ValueError) as caught:
            plant.simulate_motor(12.0, 10.0, 0.001, 0.05, 0.05, 2.0e-5, 1.0e-3, steps=10)
        self.assertIn("2*L/R", str(caught.exception))
        with self.assertRaises(ValueError) as caught:
            # Stable electrically (2*L/R = 10 ms) but the mechanical pole needs dt < 2*J/b = 0.2 ms.
            plant.simulate_motor(12.0, 10.0, 0.05, 0.05, 0.05, 1.0e-6, 1.0e-2, dt=0.001, steps=10)
        self.assertIn("2*J/b", str(caught.exception))

    def test_motor_records_a_trace_when_asked(self):
        run = plant.simulate_motor(6.0, 10.0, 0.05, 0.05, 0.05, 2.0e-5, 1.0e-3, steps=7, record=True)
        self.assertEqual(len(run["trace"]), 7)


if __name__ == "__main__":
    unittest.main(verbosity=2)
