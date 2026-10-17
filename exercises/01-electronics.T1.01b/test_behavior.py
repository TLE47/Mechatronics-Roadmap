"""Behaviour tests for 01-electronics.T1.01b.

Each test names the mistake it catches:
  * a conduction loss without the square (0.4 W instead of 0.25 W at 5 A and 10 milliohms);
  * a shoot-through current through ONE switch, which halves the real fault current - the same
    order as the load, when the truth is far larger;
  * an H-bridge voltage that adds the duties instead of subtracting them, so a reversing command
    drives forward;
  * a bridge loss that counts one switch, which is exactly half the real dissipation;
  * a duty accepted as a percentage, so a 65% command asks for 780 V from a 12 V bus;
  * a recommended-window check that is exclusive at the ends the datasheet includes.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class ConductionTests(unittest.TestCase):
    def test_the_formalisation_loss(self):
        self.assertAlmostEqual(submission.conduction_loss(5.0, 0.010), 0.25, delta=1e-12)

    def test_the_worked_pwm_loss(self):
        # 0.5 * 4^2 * 0.020 = 0.16 W, against 24 W for the linear drop - 150x better.
        pwm = submission.conduction_loss(4.0, 0.020, duty=0.50)
        linear = (12.0 - 0.50 * 12.0) * 4.0
        self.assertAlmostEqual(pwm, 0.16, delta=1e-12)
        self.assertAlmostEqual(linear, 24.0, delta=1e-12)
        self.assertGreater(linear / pwm, 100.0)

    def test_the_skip_test_six_amps(self):
        self.assertAlmostEqual(submission.conduction_loss(6.0, 0.015), 0.54, delta=1e-12)

    def test_a_bad_duty_is_refused(self):
        with self.assertRaises(ValueError):
            submission.conduction_loss(1.0, 0.01, duty=1.5)


class PwmTests(unittest.TestCase):
    def test_the_formalisation_average(self):
        self.assertAlmostEqual(submission.pwm_effective_voltage(12.0, 0.75), 9.0, delta=1e-12)

    def test_the_skip_test_average(self):
        self.assertAlmostEqual(submission.pwm_effective_voltage(12.0, 0.65), 7.8, delta=1e-12)

    def test_a_percentage_is_refused_not_scaled(self):
        with self.assertRaises(ValueError):
            submission.pwm_effective_voltage(12.0, 65.0)

    def test_the_duty_round_trips(self):
        self.assertAlmostEqual(submission.duty_for_effective_voltage(9.0, 12.0), 0.75, delta=1e-12)
        with self.assertRaises(ValueError):
            submission.duty_for_effective_voltage(13.0, 12.0)


class ShootThroughTests(unittest.TestCase):
    def test_the_worked_300_amps(self):
        self.assertAlmostEqual(submission.shoot_through_current(12.0, 0.020), 300.0, delta=1e-9)

    def test_the_skip_test_shoot_through(self):
        self.assertAlmostEqual(submission.shoot_through_current(24.0, 0.010), 1200.0, delta=1e-9)

    def test_a_zero_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.shoot_through_current(12.0, 0.0)


class HBridgeTests(unittest.TestCase):
    def test_diagonal_forward_and_reverse(self):
        self.assertAlmostEqual(submission.h_bridge_voltage(12.0, 1.0, 0.0), 12.0, delta=1e-12)
        self.assertAlmostEqual(submission.h_bridge_voltage(12.0, 0.0, 1.0), -12.0, delta=1e-12)

    def test_the_skip_test_differential(self):
        # D_A = 0.25, D_B = 0.75 at 24 V -> -12 V (reverse at half the bus).
        self.assertAlmostEqual(submission.h_bridge_voltage(24.0, 0.25, 0.75), -12.0, delta=1e-9)

    def test_equal_duties_are_zero_volts(self):
        self.assertAlmostEqual(submission.h_bridge_voltage(24.0, 0.4, 0.4), 0.0, delta=1e-12)

    def test_a_bad_duty_is_refused(self):
        with self.assertRaises(ValueError):
            submission.h_bridge_voltage(12.0, 1.2, 0.0)


class BridgeLossTests(unittest.TestCase):
    def test_the_exercise_518_milliwatts(self):
        self.assertAlmostEqual(
            submission.bridge_conduction_loss(1.2, 0.18, 0.18), 0.5184, delta=1e-4)

    def test_one_switch_is_half_the_truth(self):
        both = submission.bridge_conduction_loss(1.2, 0.18, 0.18)
        one = submission.bridge_conduction_loss(1.2, 0.18, 0.0)
        self.assertAlmostEqual(both / one, 2.0, delta=1e-12)

    def test_duty_scales_the_average_loss(self):
        self.assertAlmostEqual(
            submission.bridge_conduction_loss(1.2, 0.18, 0.18, duty=0.5), 0.2592, delta=1e-12)


class DatasheetTests(unittest.TestCase):
    def test_nine_volts_is_inside_and_the_absolute_max_is_not(self):
        self.assertTrue(submission.within_recommended(9.0))
        self.assertTrue(submission.within_recommended(2.7))
        self.assertTrue(submission.within_recommended(10.8))
        self.assertFalse(submission.within_recommended(11.8))
        self.assertFalse(submission.within_recommended(2.0))

    def test_an_inverted_window_is_refused(self):
        with self.assertRaises(ValueError):
            submission.within_recommended(5.0, v_min=10.0, v_max=2.0)


if __name__ == "__main__":
    unittest.main()
