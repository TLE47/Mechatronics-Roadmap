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
        self.assertAlmostEqual(
            submission.rc_time_constant(R_WORKED, C_WORKED), 1e-3, delta=1e-15,
            msg="expected 10 kohm with 0.1 uF to give a 1 ms time constant; 1e-6 or 1e-9 likely "
                "dropped a prefix - check R * C in base units",
        )

    def test_the_skip_test_time_constant(self):
        self.assertAlmostEqual(
            submission.rc_time_constant(4700.0, 10e-6), 0.047, delta=1e-15,
            msg="expected 4.7 kohm with 10 uF to give 47 ms; 4.7e-8 likely skipped the micro "
                "prefix on the capacitor - check the farads",
        )

    def test_the_worked_cutoff(self):
        # tau = 1 ms -> 1 / (2 pi * 1e-3) = 159.155 Hz.
        self.assertAlmostEqual(
            submission.rc_cutoff_hz(R_WORKED, C_WORKED), 159.154943, delta=1e-5,
            msg="expected a 1 ms time constant to put the corner at 159.15 Hz; 1000 means the "
                "2 pi was forgotten, 6.28 means the conversion was inverted - check the formula",
        )

    def test_the_corner_scales_with_both_parts(self):
        base = submission.rc_cutoff_hz(1000.0, 1e-6)
        self.assertAlmostEqual(
            submission.rc_cutoff_hz(1000.0, 2e-6), base / 2.0, delta=1e-9,
            msg="expected doubling the capacitance to halve the corner; an unchanged value means "
                "the capacitor was ignored - check C is in the denominator",
        )
        self.assertAlmostEqual(
            submission.rc_cutoff_hz(2000.0, 1e-6), base / 2.0, delta=1e-9,
            msg="expected doubling the resistance to halve the corner as well; an unchanged value "
                "means only one part is read - check both are multiplied",
        )

    def test_bad_parts_are_refused(self):
        for r, c in ((0.0, 1e-6), (1000.0, 0.0), (-1.0, 1e-6)):
            with self.assertRaises(ValueError):
                submission.rc_time_constant(r, c)
            with self.assertRaises(ValueError):
                submission.rc_cutoff_hz(r, c)


class ChargingTests(unittest.TestCase):
    def test_one_time_constant_reaches_63_percent(self):
        value = submission.rc_voltage(1e-3, V_IN, R_WORKED, C_WORKED)
        self.assertAlmostEqual(
            value, 2.085998, delta=1e-6,
            msg="expected one time constant to reach 2.086 V of the 3.3 V rail; 3.3 means the "
                "curve was drawn as a straight ramp to full scale - check the exponential",
        )
        self.assertAlmostEqual(
            100.0 * value / V_IN, 63.2120559, delta=1e-4,
            msg="expected the curve to be at 63.2 percent after one tau; 100 percent means it "
                "reached the rail in a single time constant, which no capacitor does",
        )

    def test_five_time_constants_has_settled(self):
        self.assertAlmostEqual(
            submission.rc_voltage(5e-3, V_IN, R_WORKED, C_WORKED),
            3.277765, delta=1e-6,
            msg="expected five time constants to be within 0.7 percent of the rail, 3.2778 V; "
                "2.086 belongs to one tau - check the exponent is t/tau",
        )

    def test_the_curve_starts_at_zero_and_rises(self):
        values = [submission.rc_voltage(t, V_IN, R_WORKED, C_WORKED)
                  for t in (0.0, 0.25e-3, 0.5e-3, 1e-3)]
        self.assertAlmostEqual(
            values[0], 0.0, delta=1e-15,
            msg="expected the curve to start at exactly zero volts; a nonzero start means the "
                "exponential was offset so it could reach the rail sooner",
        )
        for earlier, later in zip(values, values[1:]):
            self.assertLess(
                earlier, later,
                msg="expected every sample to be above the one before it, since a capacitor "
                    "charges monotonically; a drop means the exponent lost its sign",
            )
        self.assertLess(
            values[-1], V_IN,
            msg="expected the curve to stay strictly below the 3.3 V rail, since exp(-t/tau) is "
                "never zero at finite time; equality means the exponential was dropped",
        )

    def test_a_negative_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rc_voltage(-1e-3, V_IN, R_WORKED, C_WORKED)


class BulkTests(unittest.TestCase):
    def test_the_exercise_240_microfarads(self):
        # 3 A for 20 us with a 0.25 V budget: 2.4e-4 F.
        self.assertAlmostEqual(
            submission.bulk_capacitance_f(3.0, 20e-6, 0.25),
            2.4e-4, delta=1e-15,
            msg="expected I dt / dV = 3 * 20e-6 / 0.25 = 240 uF; 12.0 comes from dividing by the "
                "current instead of the droop - check the denominator is the voltage budget",
        )

    def test_a_100_microfarad_part_sags_six_tenths(self):
        # The Break-it case: a 100 uF part in the same transient sags 0.6 V.
        self.assertAlmostEqual(
            submission.bulk_capacitance_f(3.0, 20e-6, 0.6),
            1.0e-4, delta=1e-15,
            msg="expected a relaxed 0.6 V droop to ask for only 100 uF; 2.4e-4 means the budget "
                "was ignored - check the 0.6 in the denominator",
        )

    def test_the_470_microfarad_fix(self):
        self.assertAlmostEqual(
            submission.bulk_capacitance_f(3.0, 20e-6, 0.127659574),
            4.7e-4, delta=1e-9,
            msg="expected the nearest standard 470 uF part to cover the revised droop budget; "
                "another value likely used the original 0.25 V - check the budget argument",
        )

    def test_a_zero_droop_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bulk_capacitance_f(3.0, 20e-6, 0.0)


class EnergyTests(unittest.TestCase):
    def test_the_worked_capacitor_energy(self):
        self.assertAlmostEqual(
            submission.capacitor_energy(12.0, 100e-6), 0.0072, delta=1e-15,
            msg="expected 0.5 * 100 uF * 12^2 = 7.2 mJ; 0.0144 means the half was dropped - "
                "check the factor",
        )

    def test_the_worked_inductor_energy(self):
        self.assertAlmostEqual(
            submission.inductor_energy(0.003, 2.0), 0.006, delta=1e-15,
            msg="expected 0.5 * 3 mH * 2^2 = 6 mJ; 0.012 means the half was dropped - check the "
                "same factor applies to the coil",
        )

    def test_the_skip_test_inductor_energy(self):
        self.assertAlmostEqual(
            submission.inductor_energy(0.004, 5.0), 0.05, delta=1e-15,
            msg="expected 0.5 * 4 mH * 25 = 50 mJ; 0.1 means the half was lost or the current "
                "was not squared - check I^2",
        )

    def test_energy_scales_with_the_square(self):
        once = submission.inductor_energy(0.004, 2.0)
        twice = submission.inductor_energy(0.004, 4.0)
        self.assertAlmostEqual(
            twice, 4.0 * once, delta=1e-15,
            msg="expected doubling the current to quadruple the coil energy; 2x means the current "
                "was not squared - check the I^2 term",
        )
        self.assertAlmostEqual(
            submission.capacitor_energy(6.0, 100e-6),
            0.25 * submission.capacitor_energy(12.0, 100e-6), delta=1e-15,
            msg="expected halving the voltage to quarter the stored energy; 0.5x means the square "
                "was dropped on the capacitor side too",
        )

    def test_negative_parts_are_refused(self):
        with self.assertRaises(ValueError):
            submission.capacitor_energy(12.0, -1e-6)
        with self.assertRaises(ValueError):
            submission.inductor_energy(-0.003, 2.0)


class FlybackTests(unittest.TestCase):
    def test_the_worked_12000_volts(self):
        self.assertAlmostEqual(
            submission.flyback_voltage(0.003, 2.0, 0.5e-6), 12_000.0, delta=1e-6,
            msg="expected 3 mH at 2 A opened in 0.5 us to spike to 12 kV; 12.0 means the micro "
                "prefix was dropped and the spike looks bus-safe - check the time is in seconds",
        )

    def test_the_formalisation_10000_volts(self):
        self.assertAlmostEqual(
            submission.flyback_voltage(0.005, 2.0, 1e-6), 10_000.0, delta=1e-6,
            msg="expected 5 mH at 2 A over 1 us to be 10 kV; 10.0 comes from the same prefix "
                "slip - check microseconds are 1e-6 s",
        )

    def test_the_diode_clamps_the_node(self):
        spike = submission.flyback_voltage(0.003, 2.0, 0.5e-6)
        clamped = 12.0 + 0.7
        self.assertAlmostEqual(
            clamped, 12.7, delta=1e-12,
            msg="expected the clamp diode to hold the node at bus plus forward drop, 12.7 V; "
                "another value likely used the 12 V bus alone - check the 0.7 V",
        )
        self.assertGreater(
            spike / clamped, 500.0,
            msg="expected the unclamped spike to be more than 500 times the clamped node, which "
                "is why the diode is not optional; a smaller ratio means the spike was computed "
                "in microseconds",
        )

    def test_a_millisecond_opening_is_bus_scale(self):
        # The trap the module names: 0.5 ms instead of 0.5 us gives 12 V, not 12000 V.
        self.assertAlmostEqual(
            submission.flyback_voltage(0.003, 2.0, 0.5e-3), 12.0, delta=1e-12,
            msg="expected a millisecond-long opening to give only 12 V, the number that hides the "
                "hazard; a huge value means the trap was not reproduced - check the time",
        )

    def test_a_zero_opening_is_refused(self):
        with self.assertRaises(ValueError):
            submission.flyback_voltage(0.003, 2.0, 0.0)


if __name__ == "__main__":
    unittest.main()
