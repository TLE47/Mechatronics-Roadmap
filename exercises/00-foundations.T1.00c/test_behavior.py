"""Behaviour tests for 00-foundations.T1.00c.

Each test names the mistake it catches:
  * an RPM-to-rad/s conversion that multiplies by 60, or by 60/(2*pi), instead of 2*pi/60 - the
    module's second Common-mistakes row;
  * a prefix table that maps nano to 1e-6, which makes a 100 nF filter 1000x too slow;
  * a trace loss computed as I R instead of I^2 R, which reports 0.18 W for the 2.7 W the module's
    exercise actually burns;
  * an RC time constant left in milliseconds;
  * a loop period reported in milliseconds instead of microseconds, so a 25 kHz FOC loop reads
    0.04 us.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class SpeedTests(unittest.TestCase):
    def test_the_worked_example_speed(self):
        # 2400 RPM * 2*pi/60 = 80*pi = 251.32741228718345 rad/s.
        self.assertAlmostEqual(submission.rpm_to_rad_s(2400.0), 80.0 * math.pi, delta=1e-9)

    def test_the_skip_test_speed(self):
        # 3000 RPM = 100*pi = 314.1592653589793 rad/s.
        self.assertAlmostEqual(submission.rpm_to_rad_s(3000.0), 314.159265, delta=1e-6)

    def test_one_revolution_per_second_is_two_pi(self):
        # 60 RPM is exactly one turn per second; this is the factor-60 discriminator.
        self.assertAlmostEqual(submission.rpm_to_rad_s(60.0), 2.0 * math.pi, delta=1e-12)

    def test_a_reversing_shaft_has_a_negative_speed(self):
        self.assertAlmostEqual(submission.rpm_to_rad_s(-120.0), -4.0 * math.pi, delta=1e-12)


class PrefixTests(unittest.TestCase):
    def test_the_worked_millinewton_metre(self):
        self.assertAlmostEqual(submission.prefix_scale(450.0, "m"), 0.45, delta=1e-15)

    def test_kilo_is_a_thousand(self):
        self.assertAlmostEqual(submission.prefix_scale(10.0, "k"), 10000.0, delta=1e-12)

    def test_nano_is_a_billionth(self):
        # 100 nF = 100 * 1e-9 = 1e-7 F. Mapping n to 1e-6 gives 1e-4 and fails here.
        self.assertAlmostEqual(submission.prefix_scale(100.0, "n"), 1e-7, delta=1e-19)

    def test_micro_is_a_millionth(self):
        self.assertAlmostEqual(submission.prefix_scale(1.0, "u"), 1e-6, delta=1e-19)

    def test_a_bare_number_is_already_in_base_units(self):
        self.assertAlmostEqual(submission.prefix_scale(7.5, ""), 7.5, delta=1e-15)

    def test_an_unknown_prefix_is_refused(self):
        for prefix in ("x", "K", "milli"):
            with self.assertRaises(ValueError):
                submission.prefix_scale(1.0, prefix)


class TraceTests(unittest.TestCase):
    def test_the_exercise_drop(self):
        # 15 A through 12 mOhm = 0.012 ohm: V_drop = 15 * 0.012 = 0.18 V.
        self.assertAlmostEqual(submission.trace_drop_v(15.0, 12e-3), 0.18, delta=1e-12)

    def test_the_exercise_loss(self):
        # Important: 15^2 * 0.012 = 225 * 0.012 = 2.7 W, fifteen times the drop's 0.18.
        self.assertAlmostEqual(submission.trace_loss_w(15.0, 12e-3), 2.70, delta=1e-12)

    def test_the_skip_test_shunt(self):
        # 20 A through a 5 mOhm shunt is 100 mV.
        self.assertAlmostEqual(submission.trace_drop_v(20.0, 5e-3), 0.1, delta=1e-12)
        self.assertAlmostEqual(submission.trace_drop_v(20.0, 5e-3) * 1e3, 100.0, delta=1e-9)

    def test_doubling_the_current_quadruples_the_loss(self):
        one = submission.trace_loss_w(15.0, 5e-3)
        two = submission.trace_loss_w(30.0, 5e-3)
        self.assertAlmostEqual(two / one, 4.0, delta=1e-12)

    def test_a_negative_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.trace_drop_v(1.0, -0.001)
        with self.assertRaises(ValueError):
            submission.trace_loss_w(1.0, -0.001)


class FilterTests(unittest.TestCase):
    def test_the_worked_example_time_constant(self):
        # 10 kOhm * 100 nF = 1e4 * 1e-7 = 1e-3 s. Returning it in ms gives 1.0 and fails here.
        self.assertAlmostEqual(submission.rc_time_constant_s(10e3, 100e-9), 1.0e-3, delta=1e-15)

    def test_the_time_constant_scales_with_the_capacitor(self):
        doubled = submission.rc_time_constant_s(10e3, 200e-9)
        self.assertAlmostEqual(doubled, 2.0e-3, delta=1e-15)

    def test_a_negative_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rc_time_constant_s(-10e3, 100e-9)

    def test_a_non_positive_capacitance_is_refused(self):
        for capacitance in (0.0, -100e-9):
            with self.assertRaises(ValueError):
                submission.rc_time_constant_s(10e3, capacitance)


class PowerTests(unittest.TestCase):
    def test_the_worked_example_power(self):
        # 0.45 N*m at 80*pi rad/s = 113.0973355 W.
        self.assertAlmostEqual(
            submission.shaft_power_w(0.45, submission.rpm_to_rad_s(2400.0)),
            113.0973355, delta=1e-6)

    def test_power_is_torque_times_omega(self):
        self.assertAlmostEqual(submission.shaft_power_w(2.0, 100.0), 200.0, delta=1e-12)


class PeriodTests(unittest.TestCase):
    def test_the_skip_test_period(self):
        # 1 / 25 kHz = 40 us. Reporting it in milliseconds gives 0.04 and fails here.
        self.assertAlmostEqual(submission.loop_period_us(25_000.0), 40.0, delta=1e-12)

    def test_the_frequency_round_trip(self):
        period_us = submission.loop_period_us(1000.0)
        self.assertAlmostEqual(period_us, 1000.0, delta=1e-9)
        self.assertAlmostEqual(1e6 / period_us, 1000.0, delta=1e-9)

    def test_a_non_positive_frequency_is_refused(self):
        for frequency in (0.0, -1000.0):
            with self.assertRaises(ValueError):
                submission.loop_period_us(frequency)


if __name__ == "__main__":
    unittest.main()
