"""Behaviour tests for 01-electronics.T1.01a.

Each test names the mistake it catches:
  * a divider that puts the TOP leg on top of the fraction - 20.9 V into a 3.3 V pin;
  * a "loaded" divider that quietly ignores the load, so the bench reading is 8% optimistic;
  * Joule heating without the square, which understates a 5 A current-sense resistor by 5x;
  * an LED resistor that divides the whole supply instead of the drop across the resistor (500 ohms
    where 290 belongs), leaving the LED dim;
  * a derating check that allows the full nameplate rating instead of half of it.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class OhmTests(unittest.TestCase):
    def test_the_skip_test_stall_current(self):
        self.assertAlmostEqual(submission.stall_current(12.0, 3.0), 4.0, delta=1e-12)

    def test_the_formalisation_stall_current(self):
        self.assertAlmostEqual(submission.stall_current(12.0, 2.4), 5.0, delta=1e-12)

    def test_a_zero_winding_is_refused(self):
        with self.assertRaises(ValueError):
            submission.stall_current(12.0, 0.0)


class DividerTests(unittest.TestCase):
    def test_the_skip_test_divider(self):
        self.assertAlmostEqual(submission.divider_unloaded(5.0, 10_000.0, 20_000.0),
                               10.0 / 3.0, delta=1e-9)

    def test_the_worked_battery_divider(self):
        v = submission.divider_unloaded(24.0, 68_000.0, 10_000.0)
        self.assertAlmostEqual(v, 3.076923, delta=1e-6)
        self.assertLess(v, 3.3)

    def test_the_break_it_swap_is_caught(self):
        # Swapping the legs puts 20.92 V on the ADC pin: the bottom resistor sets the fraction.
        swapped = submission.divider_unloaded(24.0, 10_000.0, 68_000.0)
        self.assertAlmostEqual(swapped, 24.0 * 68.0 / 78.0, delta=1e-9)
        self.assertGreater(swapped, 20.0)

    def test_the_loaded_output_is_lower(self):
        unloaded = submission.divider_unloaded(24.0, 68_000.0, 10_000.0)
        loaded = submission.divider_loaded(24.0, 68_000.0, 10_000.0, 100_000.0)
        self.assertAlmostEqual(loaded, 2.830189, delta=1e-6)
        self.assertLess(loaded, unloaded)

    def test_a_shorting_load_pulls_the_midpoint_to_zero(self):
        self.assertAlmostEqual(
            submission.divider_loaded(5.0, 10_000.0, 10_000.0, 1e-6), 0.0, delta=1e-9)

    def test_bad_legs_are_refused(self):
        with self.assertRaises(ValueError):
            submission.divider_unloaded(5.0, 0.0, 10_000.0)
        with self.assertRaises(ValueError):
            submission.divider_loaded(5.0, 10_000.0, 10_000.0, 0.0)


class PowerTests(unittest.TestCase):
    def test_the_skip_test_current_sense(self):
        # 10 A through 0.050 ohm: 5 W, and a 0.25 W part is not going to survive it.
        self.assertAlmostEqual(submission.joule_power(10.0, 0.050), 5.0, delta=1e-12)

    def test_the_stalled_winding(self):
        self.assertAlmostEqual(submission.joule_power(5.0, 2.4), 60.0, delta=1e-12)

    def test_the_square_matters(self):
        self.assertAlmostEqual(submission.joule_power(2.0, 3.0), 12.0, delta=1e-12)

    def test_a_negative_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.joule_power(1.0, -1.0)


class LedTests(unittest.TestCase):
    def test_the_exercise_resistor(self):
        self.assertAlmostEqual(submission.led_series_resistor(5.0, 2.1, 0.010), 290.0, delta=1e-9)

    def test_the_exercise_power(self):
        r = submission.led_series_resistor(5.0, 2.1, 0.010)
        self.assertAlmostEqual(submission.joule_power(0.010, r), 0.029, delta=1e-9)

    def test_the_current_round_trips(self):
        r = submission.led_series_resistor(5.0, 2.1, 0.010)
        self.assertAlmostEqual(submission.led_current(5.0, 2.1, r), 0.010, delta=1e-12)

    def test_a_reversed_led_draws_nothing(self):
        self.assertAlmostEqual(submission.led_current(3.3, 3.5, 220.0), 0.0, delta=1e-12)

    def test_bad_led_inputs_are_refused(self):
        with self.assertRaises(ValueError):
            submission.led_series_resistor(5.0, 2.1, 0.0)
        with self.assertRaises(ValueError):
            submission.led_series_resistor(5.0, 5.5, 0.010)


class DeratingTests(unittest.TestCase):
    def test_half_the_rating(self):
        self.assertTrue(submission.within_derating(0.125, 0.25))
        self.assertFalse(submission.within_derating(0.2, 0.25))
        self.assertFalse(submission.within_derating(5.76, 0.25))

    def test_a_custom_fraction(self):
        self.assertTrue(submission.within_derating(0.2, 0.25, derating=0.8))
        with self.assertRaises(ValueError):
            submission.within_derating(0.1, 0.25, derating=0.0)


if __name__ == "__main__":
    unittest.main()
