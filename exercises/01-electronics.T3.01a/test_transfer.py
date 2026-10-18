"""Transfer tests for 01-electronics.T3.01a - the same laws on the plant's own constants.

Five claims:
  1. a 2nd-order Bessel filter whose corner sits on the plant's 1 kHz tick delays a sample by
     159.15 us - 16% of a tick, so the AFE does not smear the current the loop acts on;
  2. a 12-bit SAR ADC and the plant's 12-bit AS5600 share one LSB count, 4096, so a 0.5 LSB
     acquisition budget is half an encoder count;
  3. a 10 ms stall burst is ten plant ticks, and the die's 5 ms stage has carried 86.47% of its
     steady rise by then;
  4. a first-order stage whose tau is the plant's own inertia over damping (I1 / B1 = 0.2 s)
     reaches 63.21% of its final value in one time constant, whatever the physical quantity;
  5. across the plant's 0.20 s disturbance window the 30 s heatsink stage rises by 0.66% while the
     5 ms die stage has fully arrived - the reason a housing thermistor cannot protect silicon.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class BesselOnThePlantTickTests(unittest.TestCase):
    def test_a_corner_on_the_plant_tick_delays_less_than_a_tick(self):
        tick_hz = 1.0 / plant.DT
        delay_us = submission.bessel_group_delay_us(tick_hz)
        self.assertAlmostEqual(
            tick_hz, 1000.0, delta=1e-12,
            msg="expected the plant's DT to be a 1 kHz tick; a different rate means every delay "
                "below is compared against the wrong clock - check plant.DT",
        )
        self.assertAlmostEqual(
            delay_us, 159.154943, delta=1e-6,
            msg="expected 1 / (2 pi 1 kHz) to be 159.15 us; 62.8 means the 2 pi was dropped and "
                "the filter looks 2.5 times faster than it is - check the group delay",
        )
        self.assertAlmostEqual(
            delay_us / (plant.DT * 1e6), 0.159154943, delta=1e-9,
            msg="expected the delay to be 15.9 percent of one plant tick; a larger fraction means "
                "the corner was set below the sampling rate - check f0 against 1 / DT",
        )
        self.assertLess(
            delay_us, plant.DT * 1e6,
            msg="expected the anti-alias delay to stay under one tick, so the current loop sees "
                "the present sample; a larger delay means the filter corner is too low",
        )

    def test_the_bessel_q_is_under_critical_damping(self):
        self.assertAlmostEqual(
            submission.bessel_q(), 1.0 / math.sqrt(3.0), delta=1e-12,
            msg="expected a 2nd-order Bessel to have Q = 0.577; 0.707 means a Butterworth was "
                "modelled, which overshoots on a step - check the filter family",
        )
        self.assertLess(
            submission.bessel_q(), 0.5 * math.sqrt(2.0),
            msg="expected the Bessel Q to sit below the 0.707 half-power value, which is what "
                "buys the flat group delay; equality means the family was confused",
        )


class SharedTwelveBitsTests(unittest.TestCase):
    def test_the_adc_and_the_encoder_share_4096_counts(self):
        # At t = 0 the settling error is 2**bits x droop; with 12 bits that is 4096 x 5/185.
        value = submission.charge_settling_lsb(plant.ENCODER_BITS, 5e-12, 180e-12, 33.0, 0.0)
        self.assertAlmostEqual(
            value, 110.702702703, delta=1e-9,
            msg="expected a 5/185 droop at 12 bits to leave 110.7 LSB at t = 0; 0.027 means the "
                "code count was not scaled by 2**bits - check the full-scale factor",
        )
        self.assertAlmostEqual(
            value, plant.ENCODER_CPR * 5.0 / 185.0, delta=1e-9,
            msg="expected the ADC's worst-case error to equal 4096 counts times the droop, the "
                "same 4096 the encoder uses; a mismatch means the two bit counts differ",
        )

    def test_half_an_lsb_is_less_than_one_encoder_count(self):
        # 0.5 LSB of 12 bits is 1/8192 of full scale; one encoder count is 1/4096 of a turn.
        half_lsb = 0.5 / (2 ** plant.ENCODER_BITS)
        self.assertAlmostEqual(
            half_lsb, 1.0 / 8192.0, delta=1e-15,
            msg="expected half an LSB at 12 bits to be 1/8192 of full scale; 1/4096 means the "
                "halving was dropped - check the 0.5 factor",
        )
        self.assertAlmostEqual(
            2.0 * half_lsb, 1.0 / plant.ENCODER_CPR, delta=1e-15,
            msg="expected two half-LSBs to cover exactly one encoder count; a mismatch means the "
                "ADC and the AS5600 do not share a 12-bit scale - check ENCODER_CPR",
        )

    def test_the_exercise_budget_is_set_by_those_bits(self):
        # The exercise's own bucket passes at 35 ns and fails at 34.2 ns, at plant.ENCODER_BITS bits.
        late = submission.charge_settling_lsb(plant.ENCODER_BITS, 6e-12, 114e-12, 50.0, 34.2e-9)
        fine = submission.charge_settling_lsb(plant.ENCODER_BITS, 6e-12, 114e-12, 50.0, 35e-9)
        self.assertGreater(
            late, 0.5,
            msg="expected a 34.2 ns acquisition to leave more than half an LSB of error; a "
                "smaller figure means the exponential had already decayed too far - check tau",
        )
        self.assertLess(
            fine, 0.5,
            msg="expected 35 ns, the bucket's design point, to settle inside half an LSB; a larger "
                "value means the acquisition window is short by the same 0.8 ns",
        )


class StallBurstTests(unittest.TestCase):
    def test_the_stall_burst_is_ten_plant_ticks(self):
        self.assertAlmostEqual(
            0.010 / plant.DT, 10.0, delta=1e-12,
            msg="expected a 10 ms stall burst to be exactly ten 1 kHz plant ticks; a different "
                "count means the burst and the loop disagree on the clock - check DT",
        )

    def test_the_die_stage_has_arrived_after_the_burst(self):
        die = submission.cauer_junction_c(0.0, 1.0, [(0.45, 0.005)], 10 * plant.DT)
        self.assertAlmostEqual(
            die / 0.45, 1.0 - math.exp(-2.0), delta=1e-12,
            msg="expected ten ticks to be two 5 ms die time constants, so 86.47 percent of the "
                "steady rise; 63 percent means only one tau was applied - check t / tau",
        )
        self.assertGreater(
            die / 0.45, 0.86,
            msg="expected the die to have carried more than 86 percent of its rise by the end of "
                "the burst; a smaller fraction means the stage was given a longer tau",
        )

    def test_the_disturbance_window_does_not_warm_the_sink(self):
        window = plant.DIST_END_S - plant.DIST_START_S
        sink = submission.cauer_junction_c(0.0, 1.0, [(2.5, 30.0)], window) / 2.5
        die = submission.cauer_junction_c(0.0, 1.0, [(0.45, 0.005)], window) / 0.45
        self.assertAlmostEqual(
            window, 0.2, delta=1e-12,
            msg="expected the plant's disturbance window to be 0.20 s; a different span means "
                "the schedule constants disagree - check DIST_START_S and DIST_END_S",
        )
        self.assertAlmostEqual(
            sink, 1.0 - math.exp(-window / 30.0), delta=1e-12,
            msg="expected the 30 s heatsink stage to follow 1 - exp(-t / 30) over the window; a "
                "larger value means the time constant was shortened - check the ladder",
        )
        self.assertLess(
            sink, 0.01,
            msg="expected the heatsink to rise under 1 percent in 0.2 s, which is why a housing "
                "thermistor cannot see a stall; a larger rise means the tau is too short",
        )
        self.assertGreater(
            die, 0.9999,
            msg="expected the 5 ms die stage to have fully arrived by 0.20 s, forty time "
                "constants in; a smaller fraction means the stage's tau was mistyped",
        )


class PlantTimeConstantTests(unittest.TestCase):
    def test_inertia_over_damping_obeys_the_same_first_order_law(self):
        tau = plant.I1 / plant.B1
        self.assertAlmostEqual(
            tau, 0.2, delta=1e-12,
            msg="expected the plant's shoulder inertia over damping to be 0.2 s; a different "
                "value means the constants were swapped - check I1 / B1",
        )
        one = submission.cauer_junction_c(0.0, 1.0, [(1.0, tau)], tau)
        self.assertAlmostEqual(
            one, 1.0 - math.exp(-1.0), delta=1e-12,
            msg="expected any first-order stage to reach 1 - exp(-1) at one time constant; a "
                "different value means the exponent was computed with another t / tau",
        )
        self.assertAlmostEqual(
            one, 0.632120559, delta=1e-9,
            msg="expected 63.21 percent at one time constant, the number the module quotes; a "
                "different value means the thermal and mechanical laws were not unified",
        )

    def test_the_elbow_arrives_faster_than_the_shoulder(self):
        shoulder = submission.cauer_junction_c(0.0, 1.0, [(1.0, plant.I1 / plant.B1)],
                                               plant.I1 / plant.B1)
        elbow = submission.cauer_junction_c(0.0, 1.0, [(1.0, plant.I2 / plant.B2)],
                                            plant.I2 / plant.B2)
        self.assertAlmostEqual(
            elbow, shoulder, delta=1e-12,
            msg="expected both stages to reach the same 63.21 percent at their own tau, whatever "
                "their constants; a mismatch means the stage was evaluated at the wrong time",
        )
        self.assertLess(
            plant.I2 / plant.B2, plant.I1 / plant.B1,
            msg="expected the elbow's inertia over damping to be shorter than the shoulder's, "
                "which is why it settles first; a larger value means the two joints were swapped",
        )


if __name__ == "__main__":
    unittest.main()
