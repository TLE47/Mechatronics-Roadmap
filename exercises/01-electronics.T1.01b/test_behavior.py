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
        self.assertAlmostEqual(
            submission.conduction_loss(5.0, 0.010), 0.25, delta=1e-12,
            msg="expected 5 A through 10 milliohms to shed 0.25 W; 0.05 means the current was "
                "used linearly, so the part looks four times safer than it is - check I^2 R",
        )

    def test_the_worked_pwm_loss(self):
        # 0.5 * 4^2 * 0.020 = 0.16 W, against 24 W for the linear drop - 150x better.
        pwm = submission.conduction_loss(4.0, 0.020, duty=0.50)
        linear = (12.0 - 0.50 * 12.0) * 4.0
        self.assertAlmostEqual(
            pwm, 0.16, delta=1e-12,
            msg="expected a 50 percent duty to quarter the 0.32 W full-on loss, giving 0.16 W; "
                "0.32 means the duty never entered - check the D factor",
        )
        self.assertAlmostEqual(
            linear, 24.0, delta=1e-12,
            msg="expected the linear drop to burn 24 W across the pass device; 2.4 means a "
                "decimal slipped and the 150x comparison collapses - check (12 - 6) x 4",
        )
        self.assertGreater(
            linear / pwm, 100.0,
            msg="expected the PWM path to save more than 100 times over linear regulation; a "
                "smaller ratio means the duty or the current reached the wrong side - check both",
        )

    def test_the_skip_test_six_amps(self):
        self.assertAlmostEqual(
            submission.conduction_loss(6.0, 0.015), 0.54, delta=1e-12,
            msg="expected 6 A through 15 milliohms to shed 0.54 W; 0.09 means the square was "
                "dropped, which picks a package half the size it needs - check I^2 R",
        )

    def test_a_bad_duty_is_refused(self):
        with self.assertRaises(ValueError):
            submission.conduction_loss(1.0, 0.01, duty=1.5)


class PwmTests(unittest.TestCase):
    def test_the_formalisation_average(self):
        self.assertAlmostEqual(
            submission.pwm_effective_voltage(12.0, 0.75), 9.0, delta=1e-12,
            msg="expected a 75 percent duty on a 12 V bus to average 9 V; 16 means the duty was "
                "treated as a percentage - check D times V_bus",
        )

    def test_the_skip_test_average(self):
        self.assertAlmostEqual(
            submission.pwm_effective_voltage(12.0, 0.65), 7.8, delta=1e-12,
            msg="expected a 65 percent duty on 12 V to average 7.8 V; 780 means the 65 arrived "
                "raw instead of as a fraction - check the duty convention",
        )

    def test_a_percentage_is_refused_not_scaled(self):
        with self.assertRaises(ValueError):
            submission.pwm_effective_voltage(12.0, 65.0)

    def test_the_duty_round_trips(self):
        self.assertAlmostEqual(
            submission.duty_for_effective_voltage(9.0, 12.0), 0.75, delta=1e-12,
            msg="expected 9 V from a 12 V bus to need a 0.75 duty; 1.33 means the ratio was "
                "inverted and the bus was divided by the demand - check V_eff / V_bus",
        )
        with self.assertRaises(ValueError):
            submission.duty_for_effective_voltage(13.0, 12.0)


class ShootThroughTests(unittest.TestCase):
    def test_the_worked_300_amps(self):
        self.assertAlmostEqual(
            submission.shoot_through_current(12.0, 0.020), 300.0, delta=1e-9,
            msg="expected both switches on across 12 V to pass 300 A through 2 x 20 "
                "milliohms; 600 means only one switch was counted - check the factor of two",
        )

    def test_the_skip_test_shoot_through(self):
        self.assertAlmostEqual(
            submission.shoot_through_current(24.0, 0.010), 1200.0, delta=1e-9,
            msg="expected 24 V across 2 x 10 milliohms to pass 1200 A; 2400 means one switch's "
                "resistance was used, which halves the fault - check the series pair",
        )

    def test_a_zero_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.shoot_through_current(12.0, 0.0)


class HBridgeTests(unittest.TestCase):
    def test_diagonal_forward_and_reverse(self):
        self.assertAlmostEqual(
            submission.h_bridge_voltage(12.0, 1.0, 0.0), 12.0, delta=1e-12,
            msg="expected full duty on one leg to put all 12 V across the motor; 0 means the "
                "two duties were added instead of subtracted - check D_A - D_B",
        )
        self.assertAlmostEqual(
            submission.h_bridge_voltage(12.0, 0.0, 1.0), -12.0, delta=1e-12,
            msg="expected the mirrored command to reverse the polarity to -12 V; +12 means the "
                "sign of D_A - D_B was lost and the motor runs the wrong way",
        )

    def test_the_skip_test_differential(self):
        # D_A = 0.25, D_B = 0.75 at 24 V -> -12 V (reverse at half the bus).
        self.assertAlmostEqual(
            submission.h_bridge_voltage(24.0, 0.25, 0.75), -12.0, delta=1e-9,
            msg="expected a 25/75 split on 24 V to give -12 V, half the bus in reverse; +12 "
                "means the subtraction ran backwards - check D_A - D_B",
        )

    def test_equal_duties_are_zero_volts(self):
        self.assertAlmostEqual(
            submission.h_bridge_voltage(24.0, 0.4, 0.4), 0.0, delta=1e-12,
            msg="expected equal duties to cancel to 0 V, the brake state; a nonzero value means "
                "the difference was never taken - check the formula collapses at D_A = D_B",
        )

    def test_a_bad_duty_is_refused(self):
        with self.assertRaises(ValueError):
            submission.h_bridge_voltage(12.0, 1.2, 0.0)


class BridgeLossTests(unittest.TestCase):
    def test_the_exercise_518_milliwatts(self):
        self.assertAlmostEqual(
            submission.bridge_conduction_loss(1.2, 0.18, 0.18), 0.5184, delta=1e-4,
            msg="expected 1.2 A through two 0.18 ohm switches to shed 0.518 W; 0.259 means only "
                "one switch was counted - check R_high + R_low",
        )

    def test_one_switch_is_half_the_truth(self):
        both = submission.bridge_conduction_loss(1.2, 0.18, 0.18)
        one = submission.bridge_conduction_loss(1.2, 0.18, 0.0)
        self.assertAlmostEqual(
            both / one, 2.0, delta=1e-12,
            msg="expected the two-switch loss to be exactly twice the one-switch loss; 1.0 means "
                "the second resistance never entered the sum - check the series path",
        )

    def test_duty_scales_the_average_loss(self):
        self.assertAlmostEqual(
            submission.bridge_conduction_loss(1.2, 0.18, 0.18, duty=0.5), 0.2592, delta=1e-12,
            msg="expected a 50 percent duty to halve the conduction loss to 0.259 W; 0.518 means "
                "the duty was ignored and the full-on loss was reported",
        )


class DatasheetTests(unittest.TestCase):
    def test_nine_volts_is_inside_and_the_absolute_max_is_not(self):
        self.assertTrue(
            submission.within_recommended(9.0),
            msg="expected 9 V to sit inside the recommended 2.7 to 10.8 V window; False means "
                "the window was misread - check the bounds",
        )
        self.assertTrue(
            submission.within_recommended(2.7),
            msg="expected 2.7 V, the window's lower end, to pass; False means the bound is "
                "exclusive where the datasheet includes it",
        )
        self.assertTrue(
            submission.within_recommended(10.8),
            msg="expected 10.8 V, the window's upper end, to pass; False means the top bound is "
                "exclusive and a legal rail reads as a fault",
        )
        self.assertFalse(
            submission.within_recommended(11.8),
            msg="expected 11.8 V to fail the recommended window even though it is under the "
                "absolute maximum; True means the two limits were conflated",
        )
        self.assertFalse(
            submission.within_recommended(2.0),
            msg="expected 2.0 V, below the 2.7 V minimum, to fail; True means the lower bound is "
                "not being applied at all - check the comparison",
        )

    def test_an_inverted_window_is_refused(self):
        with self.assertRaises(ValueError):
            submission.within_recommended(5.0, v_min=10.0, v_max=2.0)


if __name__ == "__main__":
    unittest.main()
