"""Behaviour tests for 02-mechanics.T1.02a.

Each test names the mistake it catches:
  * gravity torque built from sin instead of cos, which puts the maximum holding torque overhead
    instead of horizontal - the module's first Common-mistakes row;
  * a link whose own mass is dropped from the sum, so a shoulder motor is sized on the payload
    alone;
  * a balance force that multiplies by the lever instead of dividing by it;
  * a gear ratio upside down (driver over driven), which turns a 4.5:1 reducer into 0.22:1;
  * an output speed multiplied by N, so a reducer is reported as a speed multiplier;
  * an output torque that ignores the belt's efficiency.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class GravityTests(unittest.TestCase):
    def test_the_worked_horizontal_torque(self):
        # (0.40*0.10 + 0.50*0.20) * 9.81 = 0.14 * 9.81 = 1.3734 N*m.
        self.assertAlmostEqual(submission.gravity_torque(0.0, 0.40, 0.10, 0.50, 0.20),
                               1.3734, delta=1e-9)

    def test_the_worked_sixty_degree_torque(self):
        self.assertAlmostEqual(submission.gravity_torque(math.pi / 3.0, 0.40, 0.10, 0.50, 0.20),
                               0.6867, delta=1e-9)

    def test_overhead_has_no_lever_arm(self):
        # The Skip test: 1 kg at 0.30 m straight up needs nothing from the shoulder.
        self.assertAlmostEqual(submission.gravity_torque(math.pi / 2.0, 1.0, 0.30),
                               0.0, delta=1e-9)

    def test_the_maximum_is_horizontal(self):
        # This is the sin/cos discriminator: horizontal must beat 45 degrees, which beats vertical.
        horizontal = submission.gravity_torque(0.0, 0.8, 0.25)
        diagonal = submission.gravity_torque(math.pi / 4.0, 0.8, 0.25)
        vertical = submission.gravity_torque(math.pi / 2.0, 0.8, 0.25)
        self.assertGreater(horizontal, diagonal)
        self.assertGreater(diagonal, vertical)

    def test_the_gate_test_maximum(self):
        self.assertAlmostEqual(submission.gravity_torque(0.0, 0.0, 0.0, 0.80, 0.25),
                               1.962, delta=1e-6)

    def test_the_gate_test_sixty_degrees(self):
        self.assertAlmostEqual(submission.gravity_torque(math.pi / 3.0, 0.0, 0.0, 0.80, 0.25),
                               0.981, delta=1e-6)

    def test_a_negative_mass_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gravity_torque(0.0, -0.1, 0.1)


class BalanceTests(unittest.TestCase):
    def test_the_skip_test_balancing_force(self):
        # 30 N at 0.20 m needs 60 N at 0.10 m.
        self.assertAlmostEqual(submission.balance_force(30.0, 0.20, 0.10), 60.0, delta=1e-12)

    def test_a_longer_lever_needs_less_force(self):
        self.assertAlmostEqual(submission.balance_force(30.0, 0.20, 0.40), 15.0, delta=1e-12)

    def test_a_force_at_the_pivot_balances_nothing(self):
        with self.assertRaises(ValueError):
            submission.balance_force(30.0, 0.20, 0.0)


class GearTests(unittest.TestCase):
    def test_the_exercise_ratio(self):
        self.assertAlmostEqual(submission.gear_ratio(72, 16), 4.5, delta=1e-12)

    def test_the_gate_test_ratio(self):
        self.assertAlmostEqual(submission.gear_ratio(100, 20), 5.0, delta=1e-12)

    def test_the_exercise_output_speed(self):
        self.assertAlmostEqual(submission.gear_output_speed(90.0, 4.5), 20.0, delta=1e-12)

    def test_the_gate_test_output_speed(self):
        self.assertAlmostEqual(submission.gear_output_speed(150.0, 5.0), 30.0, delta=1e-12)

    def test_the_exercise_output_torque(self):
        # 0.40 * 4.5 * 0.95 = 1.71 N*m.
        self.assertAlmostEqual(submission.gear_output_torque(0.40, 4.5, 0.95), 1.71, delta=1e-12)

    def test_the_gate_test_output_torque(self):
        self.assertAlmostEqual(submission.gear_output_torque(0.50, 5.0, 0.92), 2.3, delta=1e-12)

    def test_an_ideal_reducer_conserves_power(self):
        torque = submission.gear_output_torque(0.25, 8.0, 1.0)
        speed = submission.gear_output_speed(160.0, 8.0)
        self.assertAlmostEqual(torque, 2.0, delta=1e-12)
        self.assertAlmostEqual(speed, 20.0, delta=1e-12)
        self.assertAlmostEqual(submission.mechanical_power(torque, speed),
                               submission.mechanical_power(0.25, 160.0), delta=1e-12)

    def test_a_lossy_reducer_loses_exactly_eta(self):
        torque = submission.gear_output_torque(0.40, 4.5, 0.95)
        speed = submission.gear_output_speed(90.0, 4.5)
        self.assertAlmostEqual(submission.mechanical_power(torque, speed),
                               0.95 * submission.mechanical_power(0.40, 90.0), delta=1e-9)

    def test_bad_ratios_and_efficiencies_are_refused(self):
        with self.assertRaises(ValueError):
            submission.gear_ratio(72, 0)
        with self.assertRaises(ValueError):
            submission.gear_output_speed(90.0, 0.0)
        for eta in (0.0, 1.5, -0.1):
            with self.assertRaises(ValueError):
                submission.gear_output_torque(0.4, 4.5, eta)


class InertiaTests(unittest.TestCase):
    def test_the_square_law(self):
        # Reflecting 1e-5 kg*m^2 through a 4.5:1 belt multiplies it by 20.25.
        self.assertAlmostEqual(submission.reflected_inertia(1e-5, 4.5), 2.025e-4, delta=1e-15)

    def test_doubling_the_ratio_quadruples_the_inertia(self):
        one = submission.reflected_inertia(2e-5, 4.0)
        two = submission.reflected_inertia(2e-5, 8.0)
        self.assertAlmostEqual(two / one, 4.0, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
