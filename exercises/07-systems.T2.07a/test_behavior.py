"""Behaviour tests for 07-systems.T2.07a.

Each test names the mistake it catches:
  * a regenerative energy that forgets the efficiency or the half (both are silent 25%/50% errors);
  * a bus voltage computed as `V + E/C` instead of the square-root form, which is wrong by an order
    of magnitude exactly where it matters (a 166 V bus);
  * a resistor bound treated as a target, or inverted (`P^2/V`), which picks a resistor that cannot
    absorb the peak and lets the bus run away;
  * a rolling counter compared with a plain subtraction, so every rollover 15 -> 0 reads as a 15
    frame jump;
  * a watchdog window that counts the frame period instead of the frames;
  * a coverage ratio that rounds to a score instead of reporting the failed modes.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class RegenEnergyTests(unittest.TestCase):
    def test_the_worked_numbers(self):
        energy = submission.regen_energy_j(0.04, 30.0, 0.75)
        self.assertAlmostEqual(
            energy, 13.5, delta=1e-9,
            msg="expected 0.75 * 0.5 * 0.04 * 30^2 to be 13.5 J; 18 likely dropped the "
                "efficiency and 27 dropped the half - check both factors",
        )

    def test_the_efficiency_scales_it(self):
        self.assertAlmostEqual(
            submission.regen_energy_j(0.04, 30.0, 1.0), 18.0, delta=1e-9,
            msg="expected full efficiency to recover the whole 18 J; 36 likely doubled the "
                "kinetic term - check E = 0.5 J w^2",
        )
        self.assertAlmostEqual(
            submission.regen_energy_j(0.04, 30.0, 0.5), 9.0, delta=1e-9,
            msg="expected half efficiency to halve the energy to 9 J; 18 likely ignored eta - "
                "check it multiplies the kinetic term",
        )

    def test_it_grows_with_the_square_of_speed(self):
        twice = submission.regen_energy_j(0.04, 60.0, 0.75)
        once = submission.regen_energy_j(0.04, 30.0, 0.75)
        self.assertAlmostEqual(
            twice, 4.0 * once, delta=1e-9,
            msg="expected doubling the speed to quadruple the energy, since it goes as w^2; "
                "2x likely returned the speed ratio - check the square",
        )


class BusVoltageTests(unittest.TestCase):
    def test_the_unclamped_bus_is_166_volts(self):
        energy = submission.regen_energy_j(0.04, 30.0, 0.75)
        volts = submission.unclamped_bus_v(24.0, energy, 1000e-6)
        self.assertAlmostEqual(
            volts, math.sqrt(27576.0), delta=1e-9,
            msg="expected sqrt(24^2 + 2*13.5/1e-3) = 166.06 V; 13524 likely used V + E/C - "
                "check the square-root form adds the stored energy",
        )

    def test_no_energy_is_the_nominal_bus(self):
        self.assertAlmostEqual(
            submission.unclamped_bus_v(24.0, 0.0, 1e-3), 24.0, delta=1e-12,
            msg="expected no regenerative energy to leave the bus at its nominal 24 V; another "
                "value likely added a fixed term - check sqrt(V^2) is V",
        )

    def test_more_capacitance_is_a_lower_surge(self):
        small = submission.unclamped_bus_v(24.0, 13.5, 1000e-6)
        large = submission.unclamped_bus_v(24.0, 13.5, 10000e-6)
        self.assertLess(
            large, small,
            msg="expected ten times the capacitance to give a lower surge; a larger value "
                "likely multiplied by C instead of dividing - check 2E/C",
        )
        # Ten times the capacitance quarters the stored-energy term, not the whole voltage.
        self.assertAlmostEqual(
            large * large, 24.0 ** 2 + (small * small - 24.0 ** 2) / 10.0,
            delta=1e-9,
            msg="expected ten times C to shrink the squared stored term by ten, so the squared "
                "surge by a tenth; another ratio likely divided the voltage itself - check V^2",
        )

    def test_a_zero_capacitor_is_refused(self):
        with self.assertRaises(ValueError):
            submission.unclamped_bus_v(24.0, 13.5, 0.0)


class ChopperTests(unittest.TestCase):
    def test_the_resistor_bound(self):
        self.assertAlmostEqual(
            submission.brake_resistor_max_ohm(28.0, 180.0), 4.3556, delta=1e-4,
            msg="expected a 180 W peak at 28 V to allow at most 4.3556 ohm; 0.2296 likely "
                "inverted the formula - check V^2 / P",
        )

    def test_a_four_ohm_resistor_is_inside_the_bound(self):
        bound = submission.brake_resistor_max_ohm(28.0, 180.0)
        self.assertLessEqual(
            4.0, bound,
            msg="expected a 4 ohm resistor to sit inside the dissipating bound; False likely "
                "used the bounded power as a resistor value - check the bound is a maximum",
        )
        self.assertGreater(
            4.5, bound,
            msg="expected 4.5 ohm to exceed the bound and fail to absorb the peak at 28 V; "
                "a larger bound likely dropped the square on the voltage",
        )

    def test_the_peak_current(self):
        self.assertAlmostEqual(
            submission.brake_peak_current_a(28.0, 4.0), 7.0, delta=1e-12,
            msg="expected 28 V across 4 ohm to draw 7 A; 112 likely multiplied instead of "
                "dividing - check Ohm's law",
        )
        self.assertAlmostEqual(
            submission.brake_peak_current_a(28.0, 2.0), 14.0, delta=1e-12,
            msg="expected halving the resistance to double the current to 14 A; 7 likely "
                "used a fixed resistor - check R is the argument",
        )

    def test_zero_power_has_no_bound(self):
        with self.assertRaises(ValueError):
            submission.brake_resistor_max_ohm(28.0, 0.0)


class CounterTests(unittest.TestCase):
    def test_the_normal_step(self):
        self.assertEqual(
            submission.rolling_counter_status(3, 4), "OK",
            msg="expected a single increment from 3 to 4 to be OK; another status likely "
                "computed the delta without the modulo - check (curr - prev) % 16",
        )
        self.assertEqual(
            submission.rolling_counter_status(14, 15), "OK",
            msg="expected the increment just below the rollover to be OK; a warning likely "
                "applied an off-by-one at the top of the range - check the delta is 1",
        )

    def test_a_rollover_is_not_a_jump(self):
        self.assertEqual(
            submission.rolling_counter_status(15, 0), "OK",
            msg="expected the 15 to 0 rollover to be OK, the most common valid step; a fault "
                "likely used a plain subtraction and saw 15 - check the modulo 16",
        )
        self.assertEqual(
            submission.rolling_counter_status(15, 1), "WARN_DROPPED_1",
            msg="expected one frame lost across the rollover to warn; a sequence fault likely "
                "treated the wrap as a jump - check the delta is 2 after the modulo",
        )

    def test_frozen_frames(self):
        self.assertEqual(
            submission.rolling_counter_status(7, 7), "FAULT_FROZEN",
            msg="expected a repeated counter to be a frozen fault; OK likely treated a zero "
                "delta as a valid step - check delta 0 is checked before the increment",
        )
        self.assertEqual(
            submission.rolling_counter_status(0, 0), "FAULT_FROZEN",
            msg="expected a repeated zero counter to be frozen too, since zero is a valid "
                "value; another status likely special-cased 0 - check the rule ignores value",
        )

    def test_dropped_frames_are_counted(self):
        self.assertEqual(
            submission.rolling_counter_status(2, 4), "WARN_DROPPED_1",
            msg="expected a delta of 2 to mean exactly one dropped frame; WARN_DROPPED_2 likely "
                "counted the delta itself - check delta - 1",
        )
        self.assertEqual(
            submission.rolling_counter_status(2, 5), "WARN_DROPPED_2",
            msg="expected a delta of 3 to mean two dropped frames; WARN_DROPPED_3 likely "
                "counted the delta - check the lost frames are one fewer than the step",
        )
        self.assertEqual(
            submission.rolling_counter_status(2, 6, max_drop=4), "WARN_DROPPED_3",
            msg="expected a delta of 4 to warn with a raised drop limit of 4; a sequence fault "
                "likely compared against the default 2 - check max_drop is used",
        )

    def test_a_sequence_jump_is_a_fault(self):
        self.assertEqual(
            submission.rolling_counter_status(2, 6), "FAULT_SEQ_JUMP",
            msg="expected a delta of 4 to exceed the default drop limit of 2 and fault; a "
                "warning likely ignored max_drop - check the threshold",
        )
        self.assertEqual(
            submission.rolling_counter_status(2, 9), "FAULT_SEQ_JUMP",
            msg="expected a delta of 7 to be a sequence jump, not a wrapped drop; a warning "
                "likely skipped the limit - check the delta is not reduced first",
        )


class WatchdogTests(unittest.TestCase):
    def test_the_window(self):
        self.assertAlmostEqual(
            submission.watchdog_timeout_s(3, 1e-3), 3e-3, delta=1e-15,
            msg="expected three missed 1 ms frames to trip after 3 ms; 1 ms likely returned "
                "one period - check the frame count multiplies the period",
        )
        self.assertAlmostEqual(
            submission.watchdog_timeout_s(5, 2e-3), 1e-2, delta=1e-15,
            msg="expected five missed 2 ms frames to trip after 10 ms; 2 ms likely ignored "
                "the count - check 5 * 2e-3",
        )

    def test_it_is_frames_not_frames_squared(self):
        self.assertAlmostEqual(
            submission.watchdog_timeout_s(4, 1e-3),
            4.0 * submission.watchdog_timeout_s(1, 1e-3), delta=1e-15,
            msg="expected four frames to give four times the single-frame window; 16x likely "
                "squared the count - check the window is linear in frames",
        )


class CoverageTests(unittest.TestCase):
    def test_the_ratio(self):
        self.assertAlmostEqual(
            submission.hil_coverage(4, 5), 0.8, delta=1e-12,
            msg="expected four of five fault modes to be 0.8; 80 likely reported a percentage "
                "where a fraction was asked for - check the ratio",
        )
        self.assertAlmostEqual(
            submission.hil_coverage(5, 5), 1.0, delta=1e-12,
            msg="expected all five modes covered to be exactly 1.0; 100 likely reported percent "
                "- check passed over total",
        )

    def test_an_empty_catalog_is_refused(self):
        with self.assertRaises(ValueError):
            submission.hil_coverage(0, 0)


if __name__ == "__main__":
    unittest.main()
