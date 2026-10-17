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
        self.assertAlmostEqual(tick_hz, 1000.0, delta=1e-12)
        self.assertAlmostEqual(delay_us, 159.154943, delta=1e-6)
        self.assertAlmostEqual(delay_us / (plant.DT * 1e6), 0.159154943, delta=1e-9)
        self.assertLess(delay_us, plant.DT * 1e6)

    def test_the_bessel_q_is_under_critical_damping(self):
        self.assertAlmostEqual(submission.bessel_q(), 1.0 / math.sqrt(3.0), delta=1e-12)
        self.assertLess(submission.bessel_q(), 0.5 * math.sqrt(2.0))


class SharedTwelveBitsTests(unittest.TestCase):
    def test_the_adc_and_the_encoder_share_4096_counts(self):
        # At t = 0 the settling error is 2**bits x droop; with 12 bits that is 4096 x 5/185.
        value = submission.charge_settling_lsb(plant.ENCODER_BITS, 5e-12, 180e-12, 33.0, 0.0)
        self.assertAlmostEqual(value, 110.702702703, delta=1e-9)
        self.assertAlmostEqual(value, plant.ENCODER_CPR * 5.0 / 185.0, delta=1e-9)

    def test_half_an_lsb_is_less_than_one_encoder_count(self):
        # 0.5 LSB of 12 bits is 1/8192 of full scale; one encoder count is 1/4096 of a turn.
        half_lsb = 0.5 / (2 ** plant.ENCODER_BITS)
        self.assertAlmostEqual(half_lsb, 1.0 / 8192.0, delta=1e-15)
        self.assertAlmostEqual(2.0 * half_lsb, 1.0 / plant.ENCODER_CPR, delta=1e-15)

    def test_the_exercise_budget_is_set_by_those_bits(self):
        # The exercise's own bucket passes at 35 ns and fails at 34.2 ns, at plant.ENCODER_BITS bits.
        late = submission.charge_settling_lsb(plant.ENCODER_BITS, 6e-12, 114e-12, 50.0, 34.2e-9)
        fine = submission.charge_settling_lsb(plant.ENCODER_BITS, 6e-12, 114e-12, 50.0, 35e-9)
        self.assertGreater(late, 0.5)
        self.assertLess(fine, 0.5)


class StallBurstTests(unittest.TestCase):
    def test_the_stall_burst_is_ten_plant_ticks(self):
        self.assertAlmostEqual(0.010 / plant.DT, 10.0, delta=1e-12)

    def test_the_die_stage_has_arrived_after_the_burst(self):
        die = submission.cauer_junction_c(0.0, 1.0, [(0.45, 0.005)], 10 * plant.DT)
        self.assertAlmostEqual(die / 0.45, 1.0 - math.exp(-2.0), delta=1e-12)
        self.assertGreater(die / 0.45, 0.86)

    def test_the_disturbance_window_does_not_warm_the_sink(self):
        window = plant.DIST_END_S - plant.DIST_START_S
        sink = submission.cauer_junction_c(0.0, 1.0, [(2.5, 30.0)], window) / 2.5
        die = submission.cauer_junction_c(0.0, 1.0, [(0.45, 0.005)], window) / 0.45
        self.assertAlmostEqual(window, 0.2, delta=1e-12)
        self.assertAlmostEqual(sink, 1.0 - math.exp(-window / 30.0), delta=1e-12)
        self.assertLess(sink, 0.01)
        self.assertGreater(die, 0.9999)


class PlantTimeConstantTests(unittest.TestCase):
    def test_inertia_over_damping_obeys_the_same_first_order_law(self):
        tau = plant.I1 / plant.B1
        self.assertAlmostEqual(tau, 0.2, delta=1e-12)
        one = submission.cauer_junction_c(0.0, 1.0, [(1.0, tau)], tau)
        self.assertAlmostEqual(one, 1.0 - math.exp(-1.0), delta=1e-12)
        self.assertAlmostEqual(one, 0.632120559, delta=1e-9)

    def test_the_elbow_arrives_faster_than_the_shoulder(self):
        shoulder = submission.cauer_junction_c(0.0, 1.0, [(1.0, plant.I1 / plant.B1)],
                                               plant.I1 / plant.B1)
        elbow = submission.cauer_junction_c(0.0, 1.0, [(1.0, plant.I2 / plant.B2)],
                                            plant.I2 / plant.B2)
        self.assertAlmostEqual(elbow, shoulder, delta=1e-12)  # both are at one tau ...
        self.assertLess(plant.I2 / plant.B2, plant.I1 / plant.B1)  # ... but the elbow's is shorter


if __name__ == "__main__":
    unittest.main()
