"""Behaviour tests for 04-embedded.T3.04a.

Each test names the mistake it catches:
  * an ARR that forgets the up-down counter's second tick, reporting 4250 where 2125 belongs;
  * a low-side window that subtracts the dead time once instead of at both switching edges;
  * a Q1.31 scale of 2^30, which halves every word the CORDIC coprocessor is fed;
  * a seqlock check that only compares s1 with s2, so an odd (write-in-flight) snapshot is
    accepted whenever the counter happened to come back to where it started;
  * an ISR load reported as a fraction where a percentage was asked for.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class TimerTests(unittest.TestCase):
    def test_the_worked_arr(self):
        # 170 MHz / (2 * 40 kHz) = 2125 timer ticks per PWM period.
        self.assertEqual(submission.center_aligned_arr(170_000_000.0, 40_000.0), 2125)

    def test_the_gate_test_frequency(self):
        # 170 MHz / (2 * 1700) = 50 kHz.
        self.assertAlmostEqual(submission.pwm_frequency(170_000_000.0, 1700), 50_000.0,
                               delta=1e-6)

    def test_the_worked_frequency_inverts_the_arr(self):
        self.assertAlmostEqual(submission.pwm_frequency(170_000_000.0, 2125), 40_000.0,
                               delta=1e-9)

    def test_the_skip_test_arr(self):
        # 180 MHz / (2 * 30 kHz) = 3000.
        self.assertEqual(submission.center_aligned_arr(180_000_000.0, 30_000.0), 3000)

    def test_the_exercise_arr(self):
        # 160 MHz / (2 * 25 kHz) = 3200, and the carrier period is 40 us.
        self.assertEqual(submission.center_aligned_arr(160_000_000.0, 25_000.0), 3200)
        self.assertAlmostEqual(submission.pwm_frequency(160_000_000.0, 3200), 25_000.0,
                               delta=1e-9)

    def test_an_arr_rounds_to_the_nearest_tick(self):
        # 170 MHz / (2 * 33 kHz) = 2575.7575...: the register is 2576, and the carrier is not
        # exactly 33 kHz afterwards - which is why the register, not the frequency, is the contract.
        self.assertEqual(submission.center_aligned_arr(170_000_000.0, 33_000.0), 2576)
        self.assertNotAlmostEqual(submission.pwm_frequency(170_000_000.0, 2576), 33_000.0,
                                  delta=1.0)

    def test_a_carrier_too_fast_for_the_timer_is_refused(self):
        with self.assertRaises(ValueError):
            submission.center_aligned_arr(170_000_000.0, 0.0)
        with self.assertRaises(ValueError):
            submission.center_aligned_arr(-1.0, 40_000.0)
        with self.assertRaises(ValueError):
            # 170 MHz / (2 * 200 MHz) rounds to zero ticks: there is no register value for it.
            submission.center_aligned_arr(170_000_000.0, 200_000_000.0)

    def test_a_zero_arr_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pwm_frequency(170_000_000.0, 0)


class WindowTests(unittest.TestCase):
    def test_the_worked_window(self):
        # (1 - 0.88) * 25 000 ns - 2 * 250 ns = 3000 - 500 = 2500 ns.
        self.assertAlmostEqual(submission.low_side_window_ns(0.88, 250.0, 40_000.0),
                               2500.0, delta=1e-9)

    def test_the_skip_test_window(self):
        # (1 - 0.90) * 25 000 ns - 2 * 200 ns = 2500 - 400 = 2100 ns.
        self.assertAlmostEqual(submission.low_side_window_ns(0.90, 200.0, 40_000.0),
                               2100.0, delta=1e-9)

    def test_the_dead_time_is_counted_at_both_edges(self):
        # A 50% duty at 40 kHz leaves 12 500 ns; each 100 ns dead time takes one more.
        self.assertAlmostEqual(submission.low_side_window_ns(0.50, 0.0, 40_000.0),
                               12_500.0, delta=1e-9)
        self.assertAlmostEqual(submission.low_side_window_ns(0.50, 100.0, 40_000.0),
                               12_300.0, delta=1e-9)

    def test_a_window_that_has_closed_is_negative_not_clamped(self):
        # 99% duty at 40 kHz with 250 ns dead ties leaves 250 - 500 = -250 ns: there is no low-side
        # window left, and the negative value is the diagnosis.
        self.assertAlmostEqual(submission.low_side_window_ns(0.99, 250.0, 40_000.0),
                               -250.0, delta=1e-6)

    def test_a_duty_outside_the_unit_interval_is_refused(self):
        with self.assertRaises(ValueError):
            submission.low_side_window_ns(1.2, 250.0, 40_000.0)
        with self.assertRaises(ValueError):
            submission.low_side_window_ns(-0.1, 250.0, 40_000.0)

    def test_a_negative_dead_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.low_side_window_ns(0.88, -250.0, 40_000.0)
        with self.assertRaises(ValueError):
            submission.low_side_window_ns(0.88, 250.0, 0.0)


class Q31Tests(unittest.TestCase):
    def test_the_worked_cosine_is_exactly_a_power_of_two(self):
        # cos(pi/3) = 0.5, and 0.5 * 2^31 = 2^30 = 0x40000000.
        self.assertEqual(submission.q31_encode(0.5), 1073741824)
        self.assertEqual(submission.q31_encode(0.5), 1 << 30)

    def test_the_worked_angle_encoding(self):
        # theta_e = pi/3 normalises to 1/3, and (1/3) * 2^31 = 715 827 882.67.
        self.assertEqual(submission.angle_to_q31(math.pi / 3.0), 715827883)

    def test_the_skip_test_quarter(self):
        self.assertEqual(submission.q31_encode(0.25), 536870912)
        self.assertEqual(submission.q31_encode(0.25), 1 << 29)

    def test_the_exercise_minus_half(self):
        self.assertEqual(submission.q31_encode(-0.50), -1073741824)
        self.assertEqual(submission.q31_encode(-0.50), -(1 << 30))

    def test_the_gate_test_minus_half_pi(self):
        # theta_e = -pi/2 normalises to -0.5.
        self.assertEqual(submission.angle_to_q31(-math.pi / 2.0), -1073741824)
        self.assertAlmostEqual(submission.angle_to_q31(-math.pi / 2.0) / float(1 << 31), -0.5,
                               delta=1e-12)

    def test_positive_one_overflows_into_the_minimum(self):
        # +2^31 does not fit in int32_t; the encoding clamps to 0x7FFFFFFF instead of wrapping.
        self.assertEqual(submission.q31_encode(1.0), 2147483647)
        self.assertEqual(submission.q31_encode(1.0), (1 << 31) - 1)
        self.assertNotEqual(submission.q31_encode(1.0), -2147483648)

    def test_minus_one_is_exactly_representable(self):
        self.assertEqual(submission.q31_encode(-1.0), -2147483648)

    def test_decoding_round_trips(self):
        self.assertAlmostEqual(submission.q31_decode(1073741824), 0.5, delta=1e-15)
        self.assertAlmostEqual(submission.q31_decode(-1073741824), -0.5, delta=1e-15)
        self.assertAlmostEqual(submission.q31_decode((1 << 31) - 1), 1.0 - 2.0 ** -31,
                               delta=1e-15)

    def test_an_angle_outside_the_normalised_range_is_refused(self):
        # x = theta / pi lives in [-1, 1): +pi maps to the one value the range excludes, while
        # -pi is the same physical angle and is representable exactly.
        with self.assertRaises(ValueError):
            submission.angle_to_q31(math.pi)
        self.assertEqual(submission.angle_to_q31(-math.pi), -(1 << 31))
        with self.assertRaises(ValueError):
            submission.angle_to_q31(3.5)

    def test_a_word_outside_int32_is_refused(self):
        with self.assertRaises(ValueError):
            submission.q31_decode(1 << 31)
        with self.assertRaises(ValueError):
            submission.q31_decode(-(1 << 31) - 1)


class SeqLockTests(unittest.TestCase):
    def test_a_clean_read_is_valid(self):
        self.assertTrue(submission.seqlock_valid(4, 4))
        self.assertTrue(submission.seqlock_valid(0, 0))

    def test_an_odd_snapshot_is_torn(self):
        # The writer flipped 4 -> 5 and has not finished: even though the counter never moved
        # between s1 and s2, the payload is mid-write.
        self.assertFalse(submission.seqlock_valid(5, 5))
        self.assertFalse(submission.seqlock_valid(1, 1))

    def test_a_writer_between_the_two_reads_is_torn(self):
        # s1 = 4, then 4 -> 5 -> 6 during the copy: the retry is the fix.
        self.assertFalse(submission.seqlock_valid(4, 6))
        self.assertFalse(submission.seqlock_valid(12, 14))

    def test_three_complete_writes_leave_an_even_counter(self):
        # The Gate test: 0 -> 2 -> 4 -> 6, and a reader at 6 accepts its copy.
        seq = 0
        for _write in range(3):
            seq += 2
        self.assertEqual(seq, 6)
        self.assertTrue(submission.seqlock_valid(seq, seq))
        self.assertFalse(submission.seqlock_valid(seq - 1, seq - 1))

    def test_a_negative_sequence_is_refused(self):
        with self.assertRaises(ValueError):
            submission.seqlock_valid(-2, -2)


class CpuTests(unittest.TestCase):
    def test_the_gate_test_cpu_percentage(self):
        # 100 * 3.0 us / 25.0 us = 12%.
        self.assertAlmostEqual(submission.isr_cpu_percent(3.0, 25.0), 12.0, delta=1e-9)

    def test_a_tenth_of_the_period_is_ten_percent(self):
        self.assertAlmostEqual(submission.isr_cpu_percent(2.5, 25.0), 10.0, delta=1e-12)

    def test_a_zero_period_or_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.isr_cpu_percent(3.0, 0.0)
        with self.assertRaises(ValueError):
            submission.isr_cpu_percent(0.0, 25.0)


if __name__ == "__main__":
    unittest.main()
