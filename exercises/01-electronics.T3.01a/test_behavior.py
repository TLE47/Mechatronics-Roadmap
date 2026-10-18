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
        self.assertAlmostEqual(
            value,
            0.157079633,
            delta=1e-9,
            msg="expected 0.1571 nH for a 0.10 mm prepreg, 12 mm by 15 mm plane pair; a "
            "microhenry-scale answer likely divided by height instead of multiplying, or read the "
            "1.60 mm core - check the dimension order in the formula and the stackup height",
        )

    def test_the_worked_two_layer_loop(self):
        # h = 1.60 mm core, w = 2.0 mm trace, l = 25 mm: 25.13 nH.
        value = submission.loop_inductance_nh(0.00160, 0.0020, 0.025)
        self.assertAlmostEqual(
            value,
            25.132741229,
            delta=1e-6,
            msg="expected 25.1327 nH for a 1.60 mm core with a 2 mm trace and 25 mm length; a "
            "0.157 nH result likely kept the prepreg height - check which layer pair the call "
            "is measuring",
        )

    def test_the_six_layer_loop_is_160_times_smaller(self):
        six = submission.loop_inductance_nh(0.00010, 0.012, 0.015)
        two = submission.loop_inductance_nh(0.00160, 0.0020, 0.025)
        self.assertAlmostEqual(
            two / six,
            160.0,
            delta=1e-9,
            msg="expected the 2-layer loop to be about 160 times the 6-layer one; a ratio near 1 "
            "likely means both calls received the same height - check each call's h argument",
        )
        self.assertLess(
            six,
            0.20,
            msg="expected a sub-0.2 nH plane pair; a value in the nanohenry tens likely passed "
            "h in millimetres where metres belong - check the unit of the height argument",
        )

    def test_the_worked_peak_voltages(self):
        six = submission.loop_inductance_nh(0.00010, 0.012, 0.015)
        two = submission.loop_inductance_nh(0.00160, 0.0020, 0.025)
        self.assertAlmostEqual(
            submission.turn_off_peak_v(48.0, six, 3.0),
            48.471238898,
            delta=1e-9,
            msg="expected 48.4712 V for the 6-layer loop at 3 A/ns; a 123 V answer likely passed "
            "the 2-layer inductance - check which loop is the second argument",
        )
        self.assertAlmostEqual(
            submission.turn_off_peak_v(48.0, two, 3.0),
            123.398223686,
            delta=1e-6,
            msg="expected 123.398 V for the 2-layer loop at 3 A/ns; a value near 48 V likely "
            "dropped the L di/dt term - check that the inductance and slope are both used",
        )
        # 80 V devices: the 6-layer board survives, the 2-layer one avalanches.
        self.assertLess(
            submission.turn_off_peak_v(48.0, six, 3.0),
            50.0,
            msg="expected the 6-layer spike under 50 V so an 80 V FET survives; a higher number "
            "likely means the 2-layer inductance reached this check - check the loop argument",
        )
        self.assertGreater(
            submission.turn_off_peak_v(48.0, two, 3.0),
            120.0,
            msg="expected the 2-layer spike above 120 V, which avalanches an 80 V FET; a value "
            "near 48 V likely means the L di/dt term was skipped - check the second argument",
        )

    def test_the_gate_test_loop_is_0_302_nanohenries(self):
        # h = 0.12 mm, w = 10.0 mm, l = 20.0 mm.
        value = submission.loop_inductance_nh(1.2e-4, 0.010, 0.020)
        self.assertAlmostEqual(
            value,
            0.301592895,
            delta=1e-9,
            msg="expected 0.30159 nH for 0.12 mm of prepreg, a 10 mm plane and 20 mm length; a "
            "0.157 nH answer likely reused the earlier dimensions - check this call's three "
            "arguments",
        )

    def test_the_gate_test_peak_is_54_volts(self):
        # 1.5 nH at 4 A/ns: nH x A/ns is volts, 6 V on top of a 48 V rail.
        self.assertAlmostEqual(
            submission.turn_off_peak_v(48.0, 1.5, 4.0),
            54.0,
            delta=1e-12,
            msg="expected 54 V: 48 V rail plus 1.5 nH times 4 A/ns; exactly 48 V likely means "
            "the spike term was not added - check that nH times A/ns is volts here",
        )

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
        self.assertAlmostEqual(
            submission.flux_cancelled_nh(6.0, 6.0, 5.2),
            1.6,
            delta=1e-12,
            msg="expected 1.6 nH from 6.0 + 6.0 - 2(5.2); a value near 11.6 nH likely added the "
            "mutual term instead of subtracting it twice - check the factor of two and the sign",
        )

    def test_the_mutual_term_is_counted_twice(self):
        # Uncoupled 10 + 10 = 20 nH; a 5 nH mutual removes 10 nH, not 5.
        self.assertAlmostEqual(
            submission.flux_cancelled_nh(10.0, 10.0, 0.0),
            20.0,
            delta=1e-12,
            msg="expected 20 nH with no coupling, which is just 10 + 10; a 10 nH answer likely "
            "subtracted the mutual term even when it is zero - check the early return or the sign",
        )
        self.assertAlmostEqual(
            submission.flux_cancelled_nh(10.0, 10.0, 5.0),
            10.0,
            delta=1e-12,
            msg="expected 10 nH: a 5 nH mutual removes 10 nH, not 5; a 15 nH answer likely "
            "subtracted it once - check the 2M term in the cancellation formula",
        )

    def test_an_unphysical_mutual_term_is_refused(self):
        with self.assertRaises(ValueError):
            submission.flux_cancelled_nh(6.0, 6.0, 7.0)
        with self.assertRaises(ValueError):
            submission.flux_cancelled_nh(-1.0, 6.0, 0.0)


class BesselTests(unittest.TestCase):
    def test_the_worked_group_delay(self):
        # f0 = 250 kHz: 1 / (2 pi f0) = 0.63661977 us.
        value = submission.bessel_group_delay_us(250_000.0)
        self.assertAlmostEqual(
            value,
            0.636619772,
            delta=1e-9,
            msg="expected 1/(2 pi 250 kHz) = 0.63662 us; a 4.0 us answer likely dropped the "
            "2 pi, and 0.159 us likely dropped the 1/f - check the denominator",
        )
        self.assertLess(
            value,
            1.0,
            msg="expected a sub-microsecond delay at 250 kHz; a value near 4 us likely used 1/f0 "
            "in seconds without the 2 pi - check the scaling to microseconds",
        )

    def test_the_gate_test_group_delay(self):
        # f0 = 200 kHz: 0.7957747 us.
        self.assertAlmostEqual(
            submission.bessel_group_delay_us(200_000.0),
            0.795774715,
            delta=1e-9,
            msg="expected 0.79577 us at 200 kHz; a 0.3979 us answer likely dropped a factor of "
            "two, and 0.5 us likely used 1/f alone - check the 2 pi and the frequency",
        )

    def test_the_delay_doubles_when_the_frequency_halves(self):
        self.assertAlmostEqual(
            submission.bessel_group_delay_us(100_000.0),
            2.0 * submission.bessel_group_delay_us(200_000.0),
            delta=1e-12,
            msg="expected the delay to double when the frequency halves, because it is 1/(2 pi f); "
            "a ratio near 1 likely means the frequency is not used - check the argument is passed "
            "through",
        )

    def test_the_bessel_q(self):
        self.assertAlmostEqual(
            submission.bessel_q(),
            0.577350269,
            delta=1e-9,
            msg="expected the Bessel Q of 1/sqrt(3) = 0.57735; 0.7071 likely used the "
            "Butterworth constant - check which approximation this Q belongs to",
        )
        self.assertLess(
            submission.bessel_q(),
            1.0 / math.sqrt(2.0),
            msg="expected a Bessel Q below the Butterworth 0.7071, which is what makes it maximally "
            "flat in delay; a value at or above it likely swapped the constants - check",
        )

    def test_a_zero_frequency_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bessel_group_delay_us(0.0)


class SarTests(unittest.TestCase):
    def test_the_exercise_droop_is_five_percent(self):
        # 6.0 pF into a 114.0 pF bucket: 6 / 120 = 0.050.
        self.assertAlmostEqual(
            submission.charge_droop_fraction(6e-12, 114e-12),
            0.05,
            delta=1e-15,
            msg="expected 6/(6 + 114) = 0.05; a 0.0526 answer likely divided by the bucket alone - "
            "check the denominator is the total capacitance C_in + C_filt",
        )

    def test_the_skip_test_droop_is_165_millivolts(self):
        self.assertAlmostEqual(
            submission.charge_droop_fraction(5e-12, 95e-12),
            0.05,
            delta=1e-15,
            msg="expected 5/(5 + 95) = 0.05; any other value likely used one capacitor only - "
            "check both arguments reach the formula",
        )
        self.assertAlmostEqual(
            3.30 * submission.charge_droop_fraction(5e-12, 95e-12),
            0.165,
            delta=1e-15,
            msg="expected 3.30 V times 0.05 = 0.165 V of droop; a 0.33 V answer likely used the "
            "capacitor ratio upside down - check the fraction before multiplying",
        )

    def test_the_exercise_settles_to_half_an_lsb(self):
        # tau = 50 x 114 pF = 5.70 ns, t/tau = 34.2 / 5.70 = 6.0, 204.8 e^-6 = 0.507648 LSB.
        value = submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 34.2e-9)
        self.assertAlmostEqual(
            value,
            0.507648446,
            delta=1e-9,
            msg="expected about 0.508 LSB after six time constants of a 5.70 ns tau; a value near "
            "1.0 likely followed the droop without the exponential - check the e^(-t/tau) term",
        )
        self.assertGreater(
            value,
            0.5,
            msg="expected a residual just above half an LSB, because six time constants is not quite "
            "enough for 12 bits; a value below it likely used more time than the 34.2 ns given - "
            "check t/tau",
        )

    def test_the_worked_settling_is_below_one_micro_lsb(self):
        # 5 pF, 180 pF, 33 Ohm, 150 ns: tau = 5.94 ns, 25.25 time constants, ~1e-9 LSB.
        value = submission.charge_settling_lsb(12, 5e-12, 180e-12, 33.0, 150e-9)
        self.assertLess(
            value,
            1e-6,
            msg="expected roughly 1e-9 LSB after 25 time constants; a value near 1 likely means "
            "t/tau was never formed - check the tau is nanoseconds and t is seconds",
        )
        self.assertGreater(
            value,
            0.0,
            msg="expected a small positive residual, because the exponential never reaches exactly "
            "zero; a zero likely means the return was clamped - check the final expression",
        )

    def test_the_acquisition_that_meets_the_budget_is_34_3_nanoseconds(self):
        # t_acq >= 5.70 ns x ln(4096 x 0.05 / 0.5) = 34.2865 ns; the module recommends 35 ns.
        needed = 5.70e-9 * math.log(4096.0 * 0.05 / 0.5)
        self.assertAlmostEqual(
            needed * 1e9,
            34.2865,
            delta=2e-3,
            msg="expected 5.70 ns times ln(4096 x 0.05 / 0.5) = 34.2865 ns; a 35 ns answer likely "
            "copied the recommendation - check the log ratio and its two constants",
        )
        self.assertLess(
            needed,
            35e-9,
            msg="expected the requirement under the 35 ns the module recommends; a larger number "
            "likely dropped the droop term from the log - check 4096 x 0.05 / 0.5",
        )
        self.assertAlmostEqual(
            submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 35e-9),
            0.441174,
            delta=2e-4,
            msg="expected 0.441 LSB at the recommended 35 ns; a value near 0.5 likely evaluated the "
            "34.2 ns budget instead - check the time argument",
        )
        self.assertLess(
            submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 35e-9),
            0.5,
            msg="expected under half an LSB at 35 ns, which is why the module rounds up from 34.29; "
            "a value at 0.5 or above likely used the shorter acquisition - check the time",
        )

    def test_the_break_it_ten_kilo_ohm_bucket(self):
        # Same capacitors, R_filt left at 10 kOhm: tau = 1.14 us, t/tau = 0.030, 198.7 LSB.
        value = submission.charge_settling_lsb(12, 6e-12, 114e-12, 10_000.0, 34.2e-9)
        self.assertAlmostEqual(
            value,
            198.747245,
            delta=1e-5,
            msg="expected about 198.7 LSB when R_filt is 10 kOhm, because tau becomes 1.14 us; a "
            "sub-LSB answer likely used 50 Ohm - check the resistance argument",
        )
        healthy = submission.charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 34.2e-9)
        self.assertAlmostEqual(
            value / healthy,
            391.51,
            delta=0.05,
            msg="expected the 10 kOhm filter to settle about 391 times worse; a ratio near 1 likely "
            "means R_filt was not varied between the two calls - check both arguments",
        )

    def test_a_smaller_bucket_moves_the_droop_not_the_time_constant(self):
        # Halve C_filt to 57 pF: the droop doubles to 0.0952, tau only halves to 2.85 ns.
        droop = submission.charge_droop_fraction(6e-12, 57e-12)
        self.assertAlmostEqual(
            droop,
            0.095238095238,
            delta=1e-12,
            msg="expected 6/(6 + 57) = 0.0952 with the halved bucket; a value near 0.05 likely "
            "reused the 114 pF capacitance - check the second argument",
        )
        self.assertAlmostEqual(
            droop / 0.05,
            1.904761904,
            delta=1e-9,
            msg="expected the droop to grow about 1.9 times when the bucket halves; a ratio of 1 "
            "likely means the bucket was not changed - check both capacitor values",
        )
        value = submission.charge_settling_lsb(12, 6e-12, 57e-12, 50.0, 34.2e-9)
        self.assertAlmostEqual(
            value,
            0.002397,
            delta=1e-6,
            msg="expected 0.0024 LSB with the 57 pF bucket; 0.5076 likely reused 114 pF - check "
            "that the smaller bucket reaches the settling function",
        )
        self.assertLess(
            value,
            0.5,
            msg="expected the smaller bucket to settle well under half an LSB here; a value near "
            "0.5 likely means the 114 pF case was measured instead - check the capacitance",
        )

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
        self.assertAlmostEqual(
            value - 25.0,
            46.691895,
            delta=1e-6,
            msg="expected 46.69 C after 10 ms, which is two 5 ms time constants; a rise near 54 C "
            "likely used a linear ramp instead of 1 - e^(-t/tau) - check the exponential",
        )

    def test_the_worked_heatsink_barely_moves(self):
        # 120 W x 2.5 C/W x (1 - e^(-0.01/30)) = 0.09998 C.
        value = submission.cauer_junction_c(25.0, 120.0, [(2.5, 30.0)], 0.010)
        self.assertAlmostEqual(
            value - 25.0,
            0.099983,
            delta=1e-6,
            msg="expected about 0.1 C after 10 ms into a 30 s stage; a value near 300 C likely "
            "assumed the sink reaches steady state instantly - check t/tau",
        )
        self.assertLess(
            value - 25.0,
            0.2,
            msg="expected the heatsink to move under 0.2 C in 10 ms; anything larger likely ignored "
            "the 30 s time constant - check the stage's tau, not just its resistance",
        )

    def test_the_worked_junction_stays_under_125(self):
        value = submission.cauer_junction_c(25.0, 120.0, self.STAGES, 0.010)
        self.assertAlmostEqual(
            value,
            71.791878,
            delta=1e-6,
            msg="expected 71.79 C with both stages at 10 ms; 25 C likely means the power term was "
            "dropped, and about 120 C likely means neither stage decayed - check the ladder",
        )
        self.assertLess(
            value,
            125.0,
            msg="expected the junction under the 125 C limit; a value above it likely omitted the "
            "heatsink stage and kept only the die - check both stages are summed",
        )
        self.assertGreater(
            value,
            70.0,
            msg="expected above 70 C after 10 ms at 120 W; a value near 25 C likely means no power "
            "reached the ladder - check the power argument and the stage list",
        )

    def test_the_gate_test_steady_state_is_ninety(self):
        # 30 C + 20 W (0.5 + 0.2 + 2.3) C/W at t -> infinity.
        stages = [(0.5, 10.0), (0.2, 100.0), (2.3, 1000.0)]
        self.assertAlmostEqual(
            submission.cauer_junction_c(30.0, 20.0, stages, 1e5),
            90.0,
            delta=1e-9,
            msg="expected 30 C plus 20 W times 3.0 C/W = 90 C at long time; a lower value likely "
            "summed only some stages - check every thermal resistance is included",
        )

    def test_the_die_carries_the_pulse_and_the_sink_does_not(self):
        # At 10 ms, 2 die time constants: 86.47% of the die stage's steady rise, 0.033% of the sink's.
        die = submission.cauer_junction_c(0.0, 1.0, [(0.45, 0.005)], 0.010)
        sink = submission.cauer_junction_c(0.0, 1.0, [(2.5, 30.0)], 0.010)
        self.assertAlmostEqual(
            die / 0.45,
            1.0 - math.exp(-2.0),
            delta=1e-12,
            msg="expected 86.47% of the die stage's steady rise after two time constants; a value "
            "near 1.0 likely skipped the exponential - check 1 - e^(-t/tau)",
        )
        self.assertLess(
            sink / 2.5,
            0.001,
            msg="expected the 30 s sink to absorb under 0.1% of its rise in 10 ms; more likely "
            "means the two stages' time constants are swapped - check which tau is applied",
        )
        self.assertGreater(
            die / sink,
            400.0,
            msg="expected the die to rise far faster than the sink at 10 ms; a ratio near 1 likely "
            "means both stages share one time constant - check each stage's tau",
        )

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
