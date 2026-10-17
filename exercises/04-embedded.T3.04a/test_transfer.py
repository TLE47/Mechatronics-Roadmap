"""Transfer tests for 04-embedded.T3.04a - the plant's own tick, seen through the same laws.

Three claims, measured on the shared plant:
  1. the 40 kHz carrier the module is written for is exactly 40 PWM periods inside one 1 ms plant
     tick, so the ISR that reads the ADC at the triangle peak runs 40 times per control step;
  2. at the plant's own 1 kHz rate the same register arithmetic gives ARR = 85 000 and a 119.5 us
     low-side window - four orders of magnitude more room than the 25 us carrier leaves;
  3. the module's Q1.31 word maps the plant's 2.5 N*m clamp (over a 10 N*m full scale) to 2^29,
     and its sequence check leaves an even counter after a whole second of 1 kHz writes.
"""

import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def ticks_per_second():
    """The plant integrates at DT s per tick, so one second is 1/DT of them."""
    return int(round(1.0 / plant.DT))


class CarrierAgainstThePlantTickTests(unittest.TestCase):
    def test_the_control_tick_holds_forty_carrier_periods(self):
        carrier = submission.pwm_frequency(170_000_000.0, 2125)
        self.assertAlmostEqual(carrier, 40_000.0, delta=1e-6)
        self.assertAlmostEqual(carrier / (1.0 / plant.DT), 40.0, delta=1e-9)

    def test_the_register_at_the_plants_control_rate(self):
        # 170 MHz / (2 * 1 kHz) = 85 000 ticks per 1 ms frame.
        self.assertEqual(submission.center_aligned_arr(170_000_000.0, 1.0 / plant.DT), 85_000)

    def test_the_low_side_window_at_the_plants_control_rate(self):
        # 0.12 * 1 000 000 ns - 500 ns = 119 500 ns, 4.78x the whole 25 us carrier period.
        window = submission.low_side_window_ns(0.88, 250.0, 1.0 / plant.DT)
        self.assertAlmostEqual(window, 119_500.0, delta=1e-6)
        self.assertAlmostEqual(window / 25_000.0, 4.78, delta=1e-12)

    def test_the_isr_share_of_a_plant_tick(self):
        # A 3 us WCET on the plant's 1 ms tick is 0.3% of the CPU, not 12% of a 25 us carrier.
        percent = submission.isr_cpu_percent(3.0, plant.DT * 1e6)
        self.assertAlmostEqual(percent, 0.3, delta=1e-12)


class Q31OnThePlantTests(unittest.TestCase):
    def test_the_torque_clamp_over_a_ten_newton_metre_scale(self):
        # 2.5 / 10 = 0.25, and 0.25 * 2^31 = 2^29.
        word = submission.q31_encode(plant.TAU_LIMIT / 10.0)
        self.assertEqual(word, 536870912)
        self.assertAlmostEqual(submission.q31_decode(word) * 10.0, plant.TAU_LIMIT, delta=1e-12)

    def test_the_commanded_direction_is_the_other_sign_bit(self):
        word = submission.q31_encode(-plant.TAU_LIMIT / 10.0)
        self.assertEqual(word, -536870912)
        self.assertAlmostEqual(submission.q31_decode(word) * 10.0, -plant.TAU_LIMIT, delta=1e-12)


class SequenceCounterOnThePlantTests(unittest.TestCase):
    def test_a_second_of_writes_leaves_an_even_counter(self):
        seq = 2 * ticks_per_second()
        self.assertEqual(seq, 2000)
        self.assertTrue(submission.seqlock_valid(seq, seq))
        self.assertTrue(submission.seqlock_valid(seq, seq + 2) is False)

    def test_a_reader_caught_by_the_last_tick_retries(self):
        seq = 2 * ticks_per_second()
        self.assertFalse(submission.seqlock_valid(seq, seq + 2))
        self.assertFalse(submission.seqlock_valid(seq + 1, seq + 1))


if __name__ == "__main__":
    unittest.main()
