"""Behaviour tests for 01-electronics.T1.01d.

Each test names the mistake it catches:
  * a cutoff that forgets the 2 pi, reporting 1000 Hz for a filter whose corner is 159 Hz;
  * a charging curve built as a straight ramp, which reaches the rail in one time constant instead
    of 63% of it;
  * a bulk capacitance without the transient time, which asks for 12 farads where 240 microfarads
    belongs;
  * a stored energy without the half, doubling every capacitor figure;
  * a flyback spike with the micro prefix dropped, so 12000 V reads as 12 V - "safe" by bus
    standards and fatal in fact.
"""

import math
import unittest

import harness

submission = harness.load_submission()

R_WORKED = 10_000.0
C_WORKED = 0.1e-6
V_IN = 3.3


class TimingTests(unittest.TestCase):
    def test_the_worked_time_constant(self):
        self.assertAlmostEqual(submission.rc_time_constant(R_WORKED, C_WORKED), 1e-3, delta=1e-15)

    def test_the_skip_test_time_constant(self):
        self.assertAlmostEqual(submission.rc_time_constant(4700.0, 10e-6), 0.047, delta=1e-15)

    def test_the_worked_cutoff(self):
        # tau = 1 ms -> 1 / (2 pi * 1e-3) = 159.155 Hz.
        self.assertAlmostEqual(submission.rc_cutoff_hz(R_WORKED, C_WORKED), 159.154943, delta=1e-5)

    def test_the_corner_scales_with_both_parts(self):
        base = submission.rc_cutoff_hz(1000.0, 1e-6)
        self.assertAlmostEqual(submission.rc_cutoff_hz(1000.0, 2e-6), base / 2.0, delta=1e-9)
        self.assertAlmostEqual(submission.rc_cutoff_hz(2000.0, 1e-6), base / 2.0, delta=1e-9)

    def test_bad_parts_are_refused(self):
        for r, c in ((0.0, 1e-6), (1000.0, 0.0), (-1.0, 1e-6)):
            with self.assertRaises(ValueError):
                submission.rc_time_constant(r, c)
            with self.assertRaises(ValueError):
                submission.rc_cutoff_hz(r, c)


class ChargingTests(unittest.TestCase):
    def test_one_time_constant_reaches_63_percent(self):
        value = submission.rc_voltage(1e-3, V_IN, R_WORKED, C_WORKED)
        self.assertAlmostEqual(value, 2.085998, delta=1e-6)
        self.assertAlmostEqual(100.0 * value / V_IN, 63.2120559, delta=1e-4)

    def test_five_time_constants_has_settled(self):
        self.assertAlmostEqual(submission.rc_voltage(5e-3, V_IN, R_WORKED, C_WORKED),
                               3.277765, delta=1e-6)

    def test_the_curve_starts_at_zero_and_rises(self):
        values = [submission.rc_voltage(t, V_IN, R_WORKED, C_WORKED)
                  for t in (0.0, 0.25e-3, 0.5e-3, 1e-3)]
        self.assertAlmostEqual(values[0], 0.0, delta=1e-15)
        for earlier, later in zip(values, values[1:]):
            self.assertLess(earlier, later)
        self.assertLess(values[-1], V_IN)

    def test_a_negative_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rc_voltage(-1e-3, V_IN, R_WORKED, C_WORKED)


class BulkTests(unittest.TestCase):
    def test_the_exercise_240_microfarads(self):
        # 3 A for 20 us with a 0.25 V budget: 2.4e-4 F.
        self.assertAlmostEqual(submission.bulk_capacitance_f(3.0, 20e-6, 0.25),
                               2.4e-4, delta=1e-15)

    def test_a_100_microfarad_part_sags_six_tenths(self):
        # The Break-it case: a 100 uF part in the same transient sags 0.6 V.
        self.assertAlmostEqual(submission.bulk_capacitance_f(3.0, 20e-6, 0.6),
                               1.0e-4, delta=1e-15)

    def test_the_470_microfarad_fix(self):
        self.assertAlmostEqual(submission.bulk_capacitance_f(3.0, 20e-6, 0.127659574),
                               4.7e-4, delta=1e-9)

    def test_a_zero_droop_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bulk_capacitance_f(3.0, 20e-6, 0.0)


class EnergyTests(unittest.TestCase):
    def test_the_worked_capacitor_energy(self):
        self.assertAlmostEqual(submission.capacitor_energy(12.0, 100e-6), 0.0072, delta=1e-15)

    def test_the_worked_inductor_energy(self):
        self.assertAlmostEqual(submission.inductor_energy(0.003, 2.0), 0.006, delta=1e-15)

    def test_the_skip_test_inductor_energy(self):
        self.assertAlmostEqual(submission.inductor_energy(0.004, 5.0), 0.05, delta=1e-15)

    def test_energy_scales_with_the_square(self):
        once = submission.inductor_energy(0.004, 2.0)
        twice = submission.inductor_energy(0.004, 4.0)
        self.assertAlmostEqual(twice, 4.0 * once, delta=1e-15)
        self.assertAlmostEqual(submission.capacitor_energy(6.0, 100e-6),
                               0.25 * submission.capacitor_energy(12.0, 100e-6), delta=1e-15)

    def test_negative_parts_are_refused(self):
        with self.assertRaises(ValueError):
            submission.capacitor_energy(12.0, -1e-6)
        with self.assertRaises(ValueError):
            submission.inductor_energy(-0.003, 2.0)


class FlybackTests(unittest.TestCase):
    def test_the_worked_12000_volts(self):
        self.assertAlmostEqual(submission.flyback_voltage(0.003, 2.0, 0.5e-6), 12_000.0,
                               delta=1e-6)

    def test_the_formalisation_10000_volts(self):
        self.assertAlmostEqual(submission.flyback_voltage(0.005, 2.0, 1e-6), 10_000.0, delta=1e-6)

    def test_the_diode_clamps_the_node(self):
        spike = submission.flyback_voltage(0.003, 2.0, 0.5e-6)
        clamped = 12.0 + 0.7
        self.assertAlmostEqual(clamped, 12.7, delta=1e-12)
        self.assertGreater(spike / clamped, 500.0)

    def test_a_millisecond_opening_is_bus_scale(self):
        # The trap the module names: 0.5 ms instead of 0.5 us gives 12 V, not 12000 V.
        self.assertAlmostEqual(submission.flyback_voltage(0.003, 2.0, 0.5e-3), 12.0, delta=1e-12)

    def test_a_zero_opening_is_refused(self):
        with self.assertRaises(ValueError):
            submission.flyback_voltage(0.003, 2.0, 0.0)


if __name__ == "__main__":
    unittest.main()
