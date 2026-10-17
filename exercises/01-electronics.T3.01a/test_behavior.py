"""Behaviour tests for 01-electronics.T3.01a.

Each test names the mistake it catches:
  * a loop inductance with width over height, which reports 2.3 uH for a 6-layer plane pair whose
    real answer is 0.157 nH - the 1.60 mm core read off the wrong stackup;
  * a mutual term added instead of subtracted, so flux cancellation becomes flux reinforcement;
  * a Bessel delay of 1/f0, the 2 pi dropped, and 4.0 us where 0.6366 us belongs;
  * a charge bucket settling without its droop, or without the exponential, so a 10 kOhm series
    resistor still looks like a 50 Ohm one;
  * a thermal ladder that is linear in time rather than first-order, which heats the heatsink at the
    die's rate and hides a 47 C die rise behind a plausible average.
"""

import math
import unittest

import harness

submission = harness.load_submission()

MU0 = 4.0 * math.pi * 1e-7


class LoopTests(unittest.TestCase):
    def test_the_worked_six_layer_loop(self):
        # h = 0.10 mm prepreg, w = 12 mm plane, l = 15 mm: 0.1571 nH.
        value = submission.loop_inductance_nh(0.00010, 0.012, 0.015)
        self.assertAlmostEqual(value, 0.157079633, delta=1e-9)

    def test_the_worked_two_layer_loop(self):
        # h = 1.60 mm core, w = 2.0 mm trace, l = 25 mm: 25.13 nH.
        value = submission.loop_inductance_nh(0.00160, 0.0020, 0.025)
        self.assertAlmostEqual(value, 25.132741229, delta=1e-6)

    def test_the_six_layer_loop_is_160_times_smaller(self):
        six = submission.loop_inductance_nh(0.00010, 0.012, 0.015)
        two = submission.loop_inductance_nh(0.00160, 0.0020, 0.025)
        self.assertAlmostEqual(two / six, 160.0, delta=1e-9)
        self.assertLess(six, 0.20)

    def test_the_worked_peak_voltages(self):
        six = submission.loop_inductance_nh(0.00010, 0.012, 0.015)
        two = submission.loop_inductance_nh(0.00160, 0.0020, 0.025)
        self.assertAlmostEqual(submission.turn_off_peak_v(48.0, six, 3.0), 48.471238898, delta=1e-9)
        self.assertAlmostEqual(submission.turn_off_peak_v(48.0, two, 3.0), 123.398223686, delta=1e-6)
        # 80 V devices: the 6-layer board survives, the 2-layer one avalanches.
        self.assertLess(submission.turn_off_peak_v(48.0, six, 3.0), 50.0)
        self.assertGreater(submission.turn_off_peak_v(48.0, two, 3.0), 120.0)

    def test_the_gate_test_loop_is_0_302_nanohenries(self):
        # h = 0.12 mm, w = 10.0 mm, l = 20.0 mm.
        value = submission.loop_inductance_nh(1.2e-4, 0.010, 0.020)
        self.assertAlmostEqual(value, 0.301592895, delta=1e-9)

    def test_the_gate_test_peak_is_54_volts(self):
        # 1.5 nH at 4 A/ns: nH x A/ns is volts, 6 V on top of a 48 V rail.
        self.assertAlmostEqual(submission.turn_off_peak_v(48.0, 1.5, 4.0), 54.0, delta=1e-12)

    def test_bad_dimensions_are_refused(self):
        for h_m, w_m, length_m in ((0.0, 0.012, 0.015), (1e-4, 0.0, 0.015),
                                   (1e-4, 0.012, -0.015)):
            with self.assertRaises(ValueError):
                submission.loop_inductance_nh(h_m, w_m, length_m)
        with self.assertRaises(ValueError):
            submission.turn_off_peak_v(48.0, -1.0, 3.0)
        with self.assertRaises(ValueError):
            submission.turn_off_peak_v(48.0, 1.5, -1.0)


class FluxTests(unittest.TestCase):
    def test_the_skip_test_is_1_6_nanohenries(self):
        # 6.0 + 6.0 - 2(5.2) = 1.6 nH.
        self.assertAlmostEqual(submission.flux_cancelled_nh(6.0, 6.0, 5.2), 1.6, delta=1e-12)

    def test_the_mutual_term_is_counted_twice(self):
        # Uncoupled 10 + 10 = 20 nH; a 5 nH mutual removes 10 nH, not 5.
        self.assertAlmostEqual(submission.flux_cancelled_nh(10.0, 10.0, 0.0), 20.0, delta=1e-12)
        self.assertAlmostEqual(submission.flux_cancelled_nh(10.0, 10.0, 5.0), 10.0, delta=1e-12)

    def test_an_unphysical_mutual_term_is_refused(self):
        with self.assertRaises(ValueError):
            submission.flux_cancelled_nh(6.0, 6.0, 7.0)
        with self.assertRaises(ValueError):
            submission.flux_cancelled_nh(-1.0, 6.0, 0.0)


class BesselTests(unittest.TestCase):
    def test_the_worked_group_delay(self):
        # f0 = 250 kHz: 1 / (2 pi f0) = 0.63661977 us.
        value = submission.bessel_group_delay_us(250_000.0)
        self.assertAlmostEqual(value, 0.636619772, delta=1e-9)
        self.assertLess(value, 1.0)

    def test_the_gate_test_group_delay(self):
        # f0 = 200 kHz: 0.7957747 us.
        self.assertAlmostEqual(submission.bessel_group_delay_us(200_000.0), 0.795774715,
                               delta=1e-9)

    def test_the_delay_doubles_when_the_frequency_halves(self):
        self.assertAlmostEqual(submission.bessel_group_delay_us(100_000.0),
                               2.0 * submission.bessel_group_delay_us(200_000.0), delta=1e-12)

    def test_the_bessel_q(self):
        self.assertAlmostEqual(submission.bessel_q(), 0.577350269, delta=1e-9)
        self.assertLess(submission.bessel_q(), 1.0 / math.sqrt(2.0))

    def test_a_zero_frequency_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bessel_group_delay_us(0.0)


class SarTests(unittest.TestCase):
    def test_the_exercise_droop_is_five_percent(self):
        # 6.0 pF into a 114.0 pF bucket: 6 / 120 = 0.050.
        self.assertAlmostEqual(submission.charge_droop_fraction(6e-12, 114e-12), 0.05, delta=1e-15)

    def test_the_skip_test_droop_is_165_millivolts(self):
        self.assertAlmostEqual(submission.charge_droop_fraction(5e-12, 95e-12), 0.05, delta=1e-15)
        self.assertAlmostEqual(3.30 * submission.charge_droop_fraction(5e-12, 95e-12), 0.165,
                               delta=1e-15)

    def test_the_exercise_settles_to_half_an_lsb(self):
        # tau = 50 x 114 pF = 5.70 ns, t/tau = 34.2 / 5.70 = 6.0, 204.8 e^-6 = 0.507648 LSB.
        value = submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 34.2e-9)
        self.assertAlmostEqual(value, 0.507648446, delta=1e-9)
        self.assertGreater(value, 0.5)

    def test_the_worked_settling_is_below_one_micro_lsb(self):
        # 5 pF, 180 pF, 33 Ohm, 150 ns: tau = 5.94 ns, 25.25 time constants, ~1e-9 LSB.
        value = submission.charge_settling_lsb(12, 5e-12, 180e-12, 33.0, 150e-9)
        self.assertLess(value, 1e-6)
        self.assertGreater(value, 0.0)

    def test_the_acquisition_that_meets_the_budget_is_34_3_nanoseconds(self):
        # t_acq >= 5.70 ns x ln(4096 x 0.05 / 0.5) = 34.2865 ns; the module recommends 35 ns.
        needed = 5.70e-9 * math.log(4096.0 * 0.05 / 0.5)
        self.assertAlmostEqual(needed * 1e9, 34.2865, delta=2e-3)
        self.assertLess(needed, 35e-9)
        self.assertAlmostEqual(submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 35e-9),
                               0.441174, delta=2e-4)
        self.assertLess(submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 35e-9), 0.5)

    def test_the_break_it_ten_kilo_ohm_bucket(self):
        # Same capacitors, R_filt left at 10 kOhm: tau = 1.14 us, t/tau = 0.030, 198.7 LSB.
        value = submission.charge_settling_lsb(12, 6e-12, 114e-12, 10_000.0, 34.2e-9)
        self.assertAlmostEqual(value, 198.747245, delta=1e-5)
        healthy = submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 34.2e-9)
        self.assertAlmostEqual(value / healthy, 391.51, delta=0.05)

    def test_a_smaller_bucket_moves_the_droop_not_the_time_constant(self):
        # Halve C_filt to 57 pF: the droop doubles to 0.0952, tau only halves to 2.85 ns.
        droop = submission.charge_droop_fraction(6e-12, 57e-12)
        self.assertAlmostEqual(droop, 0.095238095238, delta=1e-12)
        self.assertAlmostEqual(droop / 0.05, 1.904761904, delta=1e-9)
        value = submission.charge_settling_lsb(12, 6e-12, 57e-12, 50.0, 34.2e-9)
        self.assertAlmostEqual(value, 0.002397, delta=1e-6)
        self.assertLess(value, 0.5)

    def test_bad_buckets_are_refused(self):
        with self.assertRaises(ValueError):
            submission.charge_droop_fraction(0.0, 114e-12)
        with self.assertRaises(ValueError):
            submission.charge_droop_fraction(6e-12, 0.0)
        with self.assertRaises(ValueError):
            submission.charge_settling_lsb(0, 6e-12, 114e-12, 50.0, 34.2e-9)
        with self.assertRaises(ValueError):
            submission.charge_settling_lsb(12, 6e-12, 114e-12, 0.0, 34.2e-9)
        with self.assertRaises(ValueError):
            submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, -1e-9)


class ThermalTests(unittest.TestCase):
    STAGES = [(0.45, 0.005), (2.5, 30.0)]

    def test_the_worked_die_rise(self):
        # 120 W x 0.45 C/W x (1 - e^-2) = 46.69 C.
        value = submission.cauer_junction_c(25.0, 120.0, [(0.45, 0.005)], 0.010)
        self.assertAlmostEqual(value - 25.0, 46.691895, delta=1e-6)

    def test_the_worked_heatsink_barely_moves(self):
        # 120 W x 2.5 C/W x (1 - e^(-0.01/30)) = 0.09998 C.
        value = submission.cauer_junction_c(25.0, 120.0, [(2.5, 30.0)], 0.010)
        self.assertAlmostEqual(value - 25.0, 0.099983, delta=1e-6)
        self.assertLess(value - 25.0, 0.2)

    def test_the_worked_junction_stays_under_125(self):
        value = submission.cauer_junction_c(25.0, 120.0, self.STAGES, 0.010)
        self.assertAlmostEqual(value, 71.791878, delta=1e-6)
        self.assertLess(value, 125.0)
        self.assertGreater(value, 70.0)

    def test_the_gate_test_steady_state_is_ninety(self):
        # 30 C + 20 W (0.5 + 0.2 + 2.3) C/W at t -> infinity.
        stages = [(0.5, 10.0), (0.2, 100.0), (2.3, 1000.0)]
        self.assertAlmostEqual(submission.cauer_junction_c(30.0, 20.0, stages, 1e5), 90.0,
                               delta=1e-9)

    def test_the_die_carries_the_pulse_and_the_sink_does_not(self):
        # At 10 ms, 2 die time constants: 86.47% of the die stage's steady rise, 0.033% of the sink's.
        die = submission.cauer_junction_c(0.0, 1.0, [(0.45, 0.005)], 0.010)
        sink = submission.cauer_junction_c(0.0, 1.0, [(2.5, 30.0)], 0.010)
        self.assertAlmostEqual(die / 0.45, 1.0 - math.exp(-2.0), delta=1e-12)
        self.assertLess(sink / 2.5, 0.001)
        self.assertGreater(die / sink, 400.0)

    def test_bad_ladders_are_refused(self):
        with self.assertRaises(ValueError):
            submission.cauer_junction_c(25.0, 120.0, [], 0.010)
        with self.assertRaises(ValueError):
            submission.cauer_junction_c(25.0, 120.0, [(0.45, 0.0)], 0.010)
        with self.assertRaises(ValueError):
            submission.cauer_junction_c(25.0, -1.0, [(0.45, 0.005)], 0.010)
        with self.assertRaises(ValueError):
            submission.cauer_junction_c(25.0, 120.0, [(0.45, 0.005)], -0.010)


if __name__ == "__main__":
    unittest.main()
