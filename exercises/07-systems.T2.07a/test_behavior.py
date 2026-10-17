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
        self.assertAlmostEqual(energy, 13.5, delta=1e-9)

    def test_the_efficiency_scales_it(self):
        self.assertAlmostEqual(submission.regen_energy_j(0.04, 30.0, 1.0), 18.0, delta=1e-9)
        self.assertAlmostEqual(submission.regen_energy_j(0.04, 30.0, 0.5), 9.0, delta=1e-9)

    def test_it_grows_with_the_square_of_speed(self):
        twice = submission.regen_energy_j(0.04, 60.0, 0.75)
        once = submission.regen_energy_j(0.04, 30.0, 0.75)
        self.assertAlmostEqual(twice, 4.0 * once, delta=1e-9)


class BusVoltageTests(unittest.TestCase):
    def test_the_unclamped_bus_is_166_volts(self):
        energy = submission.regen_energy_j(0.04, 30.0, 0.75)
        volts = submission.unclamped_bus_v(24.0, energy, 1000e-6)
        self.assertAlmostEqual(volts, math.sqrt(27576.0), delta=1e-9)

    def test_no_energy_is_the_nominal_bus(self):
        self.assertAlmostEqual(submission.unclamped_bus_v(24.0, 0.0, 1e-3), 24.0, delta=1e-12)

    def test_more_capacitance_is_a_lower_surge(self):
        small = submission.unclamped_bus_v(24.0, 13.5, 1000e-6)
        large = submission.unclamped_bus_v(24.0, 13.5, 10000e-6)
        self.assertLess(large, small)
        # Ten times the capacitance quarters the stored-energy term, not the whole voltage.
        self.assertAlmostEqual(large * large, 24.0 ** 2 + (small * small - 24.0 ** 2) / 10.0,
                               delta=1e-9)

    def test_a_zero_capacitor_is_refused(self):
        with self.assertRaises(ValueError):
            submission.unclamped_bus_v(24.0, 13.5, 0.0)


class ChopperTests(unittest.TestCase):
    def test_the_resistor_bound(self):
        self.assertAlmostEqual(submission.brake_resistor_max_ohm(28.0, 180.0), 4.3556, delta=1e-4)

    def test_a_four_ohm_resistor_is_inside_the_bound(self):
        bound = submission.brake_resistor_max_ohm(28.0, 180.0)
        self.assertLessEqual(4.0, bound)
        self.assertGreater(4.5, bound, "4.5 ohm would not absorb the peak at 28 V")

    def test_the_peak_current(self):
        self.assertAlmostEqual(submission.brake_peak_current_a(28.0, 4.0), 7.0, delta=1e-12)
        self.assertAlmostEqual(submission.brake_peak_current_a(28.0, 2.0), 14.0, delta=1e-12)

    def test_zero_power_has_no_bound(self):
        with self.assertRaises(ValueError):
            submission.brake_resistor_max_ohm(28.0, 0.0)


class CounterTests(unittest.TestCase):
    def test_the_normal_step(self):
        self.assertEqual(submission.rolling_counter_status(3, 4), "OK")
        self.assertEqual(submission.rolling_counter_status(14, 15), "OK")

    def test_a_rollover_is_not_a_jump(self):
        self.assertEqual(submission.rolling_counter_status(15, 0), "OK")
        self.assertEqual(submission.rolling_counter_status(15, 1), "WARN_DROPPED_1")

    def test_frozen_frames(self):
        self.assertEqual(submission.rolling_counter_status(7, 7), "FAULT_FROZEN")
        self.assertEqual(submission.rolling_counter_status(0, 0), "FAULT_FROZEN")

    def test_dropped_frames_are_counted(self):
        self.assertEqual(submission.rolling_counter_status(2, 4), "WARN_DROPPED_1")
        self.assertEqual(submission.rolling_counter_status(2, 5), "WARN_DROPPED_2")
        self.assertEqual(submission.rolling_counter_status(2, 6, max_drop=4), "WARN_DROPPED_3")

    def test_a_sequence_jump_is_a_fault(self):
        self.assertEqual(submission.rolling_counter_status(2, 6), "FAULT_SEQ_JUMP")
        self.assertEqual(submission.rolling_counter_status(2, 9), "FAULT_SEQ_JUMP")


class WatchdogTests(unittest.TestCase):
    def test_the_window(self):
        self.assertAlmostEqual(submission.watchdog_timeout_s(3, 1e-3), 3e-3, delta=1e-15)
        self.assertAlmostEqual(submission.watchdog_timeout_s(5, 2e-3), 1e-2, delta=1e-15)

    def test_it_is_frames_not_frames_squared(self):
        self.assertAlmostEqual(submission.watchdog_timeout_s(4, 1e-3),
                               4.0 * submission.watchdog_timeout_s(1, 1e-3), delta=1e-15)


class CoverageTests(unittest.TestCase):
    def test_the_ratio(self):
        self.assertAlmostEqual(submission.hil_coverage(4, 5), 0.8, delta=1e-12)
        self.assertAlmostEqual(submission.hil_coverage(5, 5), 1.0, delta=1e-12)

    def test_an_empty_catalog_is_refused(self):
        with self.assertRaises(ValueError):
            submission.hil_coverage(0, 0)


if __name__ == "__main__":
    unittest.main()
