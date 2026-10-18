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
        self.assertAlmostEqual(
            submission.stall_current(12.0, 3.0), 4.0, delta=1e-12,
            msg="expected a 12 V supply across a 3 ohm winding to draw 4 A stall current; 36 "
                "likely multiplied instead of dividing - check V / R",
        )

    def test_the_formalisation_stall_current(self):
        self.assertAlmostEqual(
            submission.stall_current(12.0, 2.4), 5.0, delta=1e-12,
            msg="expected 12 V across 2.4 ohm to draw 5 A; 28.8 means the resistance was "
                "multiplied - check Ohm's law",
        )

    def test_a_zero_winding_is_refused(self):
        with self.assertRaises(ValueError):
            submission.stall_current(12.0, 0.0)


class DividerTests(unittest.TestCase):
    def test_the_skip_test_divider(self):
        self.assertAlmostEqual(
            submission.divider_unloaded(5.0, 10_000.0, 20_000.0),
            10.0 / 3.0, delta=1e-9,
            msg="expected a 10k over 20k divider on 5 V to give 3.333 V; 1.667 means the top leg "
                "was put on top of the fraction, which is the 180 deg error - check v_in r2/(r1+r2)",
        )

    def test_the_worked_battery_divider(self):
        v = submission.divider_unloaded(24.0, 68_000.0, 10_000.0)
        self.assertAlmostEqual(
            v, 3.076923, delta=1e-6,
            msg="expected a 24 V rail through 68k over 10k to give 3.077 V; 20.92 means the legs "
                "were swapped and the ADC pin would be destroyed - check the bottom leg",
        )
        self.assertLess(
            v, 3.3,
            msg="expected the divider to keep the midpoint under the 3.3 V pin rating; equality "
                "or above means the sensor divider does not protect the ADC",
        )

    def test_the_break_it_swap_is_caught(self):
        # Swapping the legs puts 20.92 V on the ADC pin: the bottom resistor sets the fraction.
        swapped = submission.divider_unloaded(24.0, 10_000.0, 68_000.0)
        self.assertAlmostEqual(
            swapped, 24.0 * 68.0 / 78.0, delta=1e-9,
            msg="expected the swallowed swap to give 20.92 V; the same 3.077 as before means the "
                "function ignored the argument order and the test cannot catch the bug",
        )
        self.assertGreater(
            swapped, 20.0,
            msg="expected the reversed legs to put more than 20 V on the pin, which is the "
                "module's failure case; a small value means the fraction was computed the same "
                "way both times",
        )

    def test_the_loaded_output_is_lower(self):
        unloaded = submission.divider_unloaded(24.0, 68_000.0, 10_000.0)
        loaded = submission.divider_loaded(24.0, 68_000.0, 10_000.0, 100_000.0)
        self.assertAlmostEqual(
            loaded, 2.830189, delta=1e-6,
            msg="expected the 100k ADC to load the 10k leg down to 2.830 V; 3.077 means the load "
                "was ignored and the bench reading is 8 percent optimistic - check the parallel "
                "combination",
        )
        self.assertLess(
            loaded, unloaded,
            msg="expected any real load to pull the midpoint below the unloaded value; equality "
                "means the load resistor never entered the calculation",
        )

    def test_a_shorting_load_pulls_the_midpoint_to_zero(self):
        self.assertAlmostEqual(
            submission.divider_loaded(5.0, 10_000.0, 10_000.0, 1e-6), 0.0, delta=1e-9,
            msg="expected a one ohm load to short the midpoint to 0 V; a nonzero value means the "
                "parallel leg was not reduced to nearly zero - check the formula survives the "
                "degenerate case",
        )

    def test_bad_legs_are_refused(self):
        with self.assertRaises(ValueError):
            submission.divider_unloaded(5.0, 0.0, 10_000.0)
        with self.assertRaises(ValueError):
            submission.divider_loaded(5.0, 10_000.0, 10_000.0, 0.0)


class PowerTests(unittest.TestCase):
    def test_the_skip_test_current_sense(self):
        # 10 A through 0.050 ohm: 5 W, and a 0.25 W part is not going to survive it.
        self.assertAlmostEqual(
            submission.joule_power(10.0, 0.050), 5.0, delta=1e-12,
            msg="expected 10^2 * 0.05 = 5 W in the sense resistor; 0.5 means the square was "
                "dropped, which understates the part by a factor of the current",
        )

    def test_the_stalled_winding(self):
        self.assertAlmostEqual(
            submission.joule_power(5.0, 2.4), 60.0, delta=1e-12,
            msg="expected 25 * 2.4 = 60 W in a stalled winding; 12 means I R was used without "
                "the square - check I^2 R",
        )

    def test_the_square_matters(self):
        self.assertAlmostEqual(
            submission.joule_power(2.0, 3.0), 12.0, delta=1e-12,
            msg="expected 4 * 3 = 12 W for 2 A through 3 ohm; 6 means the current was used "
                "linearly - check the square",
        )

    def test_a_negative_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.joule_power(1.0, -1.0)


class LedTests(unittest.TestCase):
    def test_the_exercise_resistor(self):
        self.assertAlmostEqual(
            submission.led_series_resistor(5.0, 2.1, 0.010), 290.0, delta=1e-9,
            msg="expected (5.0 - 2.1) / 0.010 = 290 ohm; 500 comes from dividing the whole "
                "supply and leaves the LED dim - check KVL subtracts the forward drop",
        )

    def test_the_exercise_power(self):
        r = submission.led_series_resistor(5.0, 2.1, 0.010)
        self.assertAlmostEqual(
            submission.joule_power(0.010, r), 0.029, delta=1e-9,
            msg="expected the 290 ohm resistor to shed 0.010^2 * 290 = 29 mW; 0.05 means the "
                "full supply was used in the power - check the drop across the resistor",
        )

    def test_the_current_round_trips(self):
        r = submission.led_series_resistor(5.0, 2.1, 0.010)
        self.assertAlmostEqual(
            submission.led_current(5.0, 2.1, r), 0.010, delta=1e-12,
            msg="expected the chosen resistor to give back the 10 mA it was sized for; a mismatch "
                "means the two functions disagree about the forward drop - check both use 2.1 V",
        )

    def test_a_reversed_led_draws_nothing(self):
        self.assertAlmostEqual(
            submission.led_current(3.3, 3.5, 220.0), 0.0, delta=1e-12,
            msg="expected a 3.5 V LED on a 3.3 V rail to draw nothing, since it cannot conduct; a "
                "negative current means the clamp is missing - check the max(0, ...)",
        )

    def test_bad_led_inputs_are_refused(self):
        with self.assertRaises(ValueError):
            submission.led_series_resistor(5.0, 2.1, 0.0)
        with self.assertRaises(ValueError):
            submission.led_series_resistor(5.0, 5.5, 0.010)


class DeratingTests(unittest.TestCase):
    def test_half_the_rating(self):
        self.assertTrue(
            submission.within_derating(0.125, 0.25),
            msg="expected half of a quarter watt, 0.125 W, to sit exactly on the derated limit; "
                "False means the bound is strict instead of inclusive",
        )
        self.assertFalse(
            submission.within_derating(0.2, 0.25),
            msg="expected 0.2 W to fail the half-rating rule for a quarter-watt part; True means "
                "the nameplate rating was used instead of half of it",
        )
        self.assertFalse(
            submission.within_derating(5.76, 0.25),
            msg="expected 5.76 W to fail spectacularly on a quarter-watt part, which is the "
                "stalled-winding case; True means the rule is not biting at all",
        )

    def test_a_custom_fraction(self):
        self.assertTrue(
            submission.within_derating(0.2, 0.25, derating=0.8),
            msg="expected 0.2 W to pass at an 80 percent derating on a quarter-watt part; False "
                "means the custom fraction was ignored - check the argument",
        )
        with self.assertRaises(ValueError):
            submission.within_derating(0.1, 0.25, derating=0.0)


if __name__ == "__main__":
    unittest.main()
