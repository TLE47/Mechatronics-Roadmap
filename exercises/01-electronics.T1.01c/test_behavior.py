"""Behaviour tests for 01-electronics.T1.01c.

Each test names the mistake it catches:
  * a supply model that never folds back, so a 0.25 ohm miswire is scored at 576 W instead of the
    0.01 W the current limit allows;
  * a critical resistance multiplied instead of divided (144 instead of 120 ohms);
  * a current-jack short computed from the voltmeter's 10 Mohm input, which reads in microamps
    where the fuse sees 1200 A;
  * breadboard clip heat without the square, which understates a 5 A motor lead by 5x;
  * a short check that fires on a healthy 240 ohm build and passes a 5 ohm miswire.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class PsuTests(unittest.TestCase):
    def test_the_worked_example_folds_back(self):
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 0.20, 0.25)
        self.assertEqual(mode, "CC")
        self.assertAlmostEqual(v_out, 0.05, delta=1e-12)
        self.assertAlmostEqual(i_out, 0.20, delta=1e-12)
        self.assertAlmostEqual(p_out, 0.01, delta=1e-12)

    def test_the_unprotected_battery_is_not_clamped(self):
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 50.0, 0.25)
        self.assertEqual(mode, "CV")
        self.assertAlmostEqual(v_out, 12.0, delta=1e-12)
        self.assertAlmostEqual(i_out, 48.0, delta=1e-12)
        self.assertAlmostEqual(p_out, 576.0, delta=1e-12)

    def test_the_exercise_stays_in_cv(self):
        # 240 ohms draws 50 mA against a 100 mA limit: 12 V, 0.05 A, 0.6 W, no foldback.
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 0.10, 240.0)
        self.assertEqual(mode, "CV")
        self.assertAlmostEqual(v_out, 12.0, delta=1e-12)
        self.assertAlmostEqual(i_out, 0.05, delta=1e-12)
        self.assertAlmostEqual(p_out, 0.6, delta=1e-12)

    def test_the_skip_test_foldback(self):
        v_out, i_out, _p_out, mode = submission.psu_output(12.0, 0.25, 4.0)
        self.assertEqual(mode, "CC")
        self.assertAlmostEqual(v_out, 1.0, delta=1e-9)
        self.assertAlmostEqual(i_out, 0.25, delta=1e-12)

    def test_the_break_it_raised_limit(self):
        v_out, _i_out, p_out, mode = submission.psu_output(12.0, 2.0, 0.25)
        self.assertEqual(mode, "CC")
        self.assertAlmostEqual(v_out, 0.50, delta=1e-12)
        self.assertAlmostEqual(p_out, 1.0, delta=1e-12)

    def test_bad_settings_are_refused(self):
        with self.assertRaises(ValueError):
            submission.psu_output(12.0, 0.0, 10.0)
        with self.assertRaises(ValueError):
            submission.psu_output(12.0, 0.2, 0.0)


class CriticalResistanceTests(unittest.TestCase):
    def test_the_exercise_threshold(self):
        self.assertAlmostEqual(submission.critical_resistance(12.0, 0.10), 120.0, delta=1e-12)

    def test_the_threshold_is_where_the_mode_changes(self):
        r_crit = submission.critical_resistance(12.0, 0.10)
        just_above = submission.psu_output(12.0, 0.10, r_crit * 1.001)
        just_below = submission.psu_output(12.0, 0.10, r_crit * 0.999)
        self.assertEqual(just_above[3], "CV")
        self.assertEqual(just_below[3], "CC")

    def test_a_zero_limit_is_refused(self):
        with self.assertRaises(ValueError):
            submission.critical_resistance(12.0, 0.0)


class DmmTests(unittest.TestCase):
    def test_voltage_mode_barely_loads_the_rail(self):
        self.assertAlmostEqual(submission.dmm_voltage_loading_current(12.0), 1.2e-6, delta=1e-18)
        self.assertLess(submission.dmm_voltage_loading_current(24.0), 3e-6)

    def test_the_current_jack_short(self):
        self.assertAlmostEqual(submission.dmm_short_current(12.0), 1200.0, delta=1e-9)

    def test_the_skip_test_with_lead_resistance(self):
        # 24 V across 0.010 ohm of shunt plus 0.010 ohm of leads.
        self.assertAlmostEqual(submission.dmm_short_current(24.0, 0.010, 0.010), 1200.0, delta=1e-9)

    def test_a_bad_shunt_is_refused(self):
        with self.assertRaises(ValueError):
            submission.dmm_short_current(12.0, 0.0)


class ClipTests(unittest.TestCase):
    def test_the_skip_test_clip_heat(self):
        self.assertAlmostEqual(submission.clip_power(5.0, 0.12), 3.0, delta=1e-6)

    def test_the_datasheet_clip(self):
        self.assertAlmostEqual(submission.clip_power(5.0, 0.05), 1.25, delta=1e-12)

    def test_the_square_matters(self):
        self.assertAlmostEqual(submission.clip_power(1.0, 4.0), 4.0, delta=1e-12)
        self.assertAlmostEqual(submission.clip_power(2.0, 1.0), 4.0, delta=1e-12)

    def test_a_negative_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.clip_power(1.0, -0.1)


class LedTests(unittest.TestCase):
    def test_the_skip_test_current(self):
        # (5.0 - 2.0) / 300 = 10 mA.
        self.assertAlmostEqual(submission.led_current_ma(5.0, 2.0, 300.0), 10.0, delta=1e-9)

    def test_the_other_resistor_family(self):
        self.assertAlmostEqual(submission.led_current_ma(5.0, 2.1, 290.0), 10.0, delta=1e-9)

    def test_reverse_bias_draws_nothing_and_a_zero_resistor_raises(self):
        self.assertEqual(submission.led_current_ma(3.3, 3.5, 220.0), 0.0)
        with self.assertRaises(ValueError):
            submission.led_current_ma(5.0, 2.0, 0.0)


class ShortCheckTests(unittest.TestCase):
    def test_a_healthy_build_is_not_a_short(self):
        self.assertFalse(submission.is_short(240.0))

    def test_a_miswire_is_a_short(self):
        self.assertTrue(submission.is_short(5.0))

    def test_the_threshold_is_exclusive(self):
        self.assertFalse(submission.is_short(10.0))
        self.assertTrue(submission.is_short(9.99))

    def test_a_bad_threshold_is_refused(self):
        with self.assertRaises(ValueError):
            submission.is_short(5.0, threshold=0.0)


if __name__ == "__main__":
    unittest.main()
