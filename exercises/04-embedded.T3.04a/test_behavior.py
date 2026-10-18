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
        self.assertEqual(
            submission.center_aligned_arr(170_000_000.0, 40_000.0),
            2125,
            "expected ARR 2125 from 170 MHz at 40 kHz; 4250 means the up-down counter's second tick "
            "was dropped - check the factor of 2 in the divider",
        )

    def test_the_gate_test_frequency(self):
        # 170 MHz / (2 * 1700) = 50 kHz.
        self.assertAlmostEqual(
            submission.pwm_frequency(170_000_000.0, 1700),
            50_000.0,
            delta=1e-6,
            msg="expected 50 kHz from ARR 1700 at 170 MHz; half that likely means the ARR was "
            "multiplied instead of divided - check which way the formula goes",
        )

    def test_the_worked_frequency_inverts_the_arr(self):
        self.assertAlmostEqual(
            submission.pwm_frequency(170_000_000.0, 2125),
            40_000.0,
            delta=1e-9,
            msg="expected 40 kHz back from ARR 2125; a different value means arr and frequency are "
            "not inverses - check both use the same clock and the same factor of 2",
        )

    def test_the_skip_test_arr(self):
        # 180 MHz / (2 * 30 kHz) = 3000.
        self.assertEqual(
            submission.center_aligned_arr(180_000_000.0, 30_000.0),
            3000,
            "expected 3000 ticks at 180 MHz and 30 kHz; 6000 likely counted only the up or down "
            "half of the carrier - check the center-aligned divider",
        )

    def test_the_exercise_arr(self):
        # 160 MHz / (2 * 25 kHz) = 3200, and the carrier period is 40 us.
        self.assertEqual(
            submission.center_aligned_arr(160_000_000.0, 25_000.0),
            3200,
            "expected ARR 3200 for 160 MHz at 25 kHz; a value near 6400 likely forgot the second "
            "counter tick - check the 2 in the divider",
        )
        self.assertAlmostEqual(
            submission.pwm_frequency(160_000_000.0, 3200),
            25_000.0,
            delta=1e-9,
            msg="expected 25 kHz back from ARR 3200; a mismatch means the two functions disagree - "
            "check the round trip uses the same clock",
        )

    def test_an_arr_rounds_to_the_nearest_tick(self):
        # 170 MHz / (2 * 33 kHz) = 2575.7575...: the register is 2576, and the carrier is not
        # exactly 33 kHz afterwards - which is why the register, not the frequency, is the contract.
        self.assertEqual(
            submission.center_aligned_arr(170_000_000.0, 33_000.0),
            2576,
            "expected 2576 after rounding 2575.7576; 2575 likely came from int() truncation - "
            "check the tick count rounds to nearest",
        )
        self.assertNotAlmostEqual(
            submission.pwm_frequency(170_000_000.0, 2576),
            33_000.0,
            delta=1.0,
            msg="expected the carrier to miss 33 kHz after rounding to 2576; an exact match means "
            "the ARR was not rounded - check the register is treated as the contract",
        )

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
        self.assertAlmostEqual(
            submission.low_side_window_ns(0.88, 250.0, 40_000.0),
            2500.0,
            delta=1e-9,
            msg="expected 2500 ns for 88% duty and 250 ns dead time; 3000 means one edge only was "
            "subtracted - check the dead time is counted at both switching edges",
        )

    def test_the_skip_test_window(self):
        # (1 - 0.90) * 25 000 ns - 2 * 200 ns = 2500 - 400 = 2100 ns.
        self.assertAlmostEqual(
            submission.low_side_window_ns(0.90, 200.0, 40_000.0),
            2100.0,
            delta=1e-9,
            msg="expected 2100 ns for 90% duty with 200 ns dead time; 2500 means the dead time was "
            "ignored entirely - check the 2 * dead_time term",
        )

    def test_the_dead_time_is_counted_at_both_edges(self):
        # A 50% duty at 40 kHz leaves 12 500 ns; each 100 ns dead time takes one more.
        self.assertAlmostEqual(
            submission.low_side_window_ns(0.50, 0.0, 40_000.0),
            12_500.0,
            delta=1e-9,
            msg="expected 12 500 ns at 50% duty with zero dead time; anything less likely "
            "subtracted a dead time that is zero - check the term is skipped when it is 0",
        )
        self.assertAlmostEqual(
            submission.low_side_window_ns(0.50, 100.0, 40_000.0),
            12_300.0,
            delta=1e-9,
            msg="expected 12 300 ns at 50% duty with 100 ns dead time; 12 400 means one edge only "
            "- check dead time is subtracted twice",
        )

    def test_a_window_that_has_closed_is_negative_not_clamped(self):
        # 99% duty at 40 kHz with 250 ns dead ties leaves 250 - 500 = -250 ns: there is no low-side
        # window left, and the negative value is the diagnosis.
        self.assertAlmostEqual(
            submission.low_side_window_ns(0.99, 250.0, 40_000.0),
            -250.0,
            delta=1e-6,
            msg="expected -250 ns when 99% duty leaves less than two dead times; a clamped 0 hides "
            "the fault - check the function returns the negative rather than max(0, ...)",
        )

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
        self.assertEqual(
            submission.q31_encode(0.5),
            1073741824,
            "expected 0x40000000 for cos(pi/3) = 0.5; 536870912 means the scale is 2^30 - check "
            "the Q1.31 word is scaled by 2^31",
        )
        self.assertEqual(
            submission.q31_encode(0.5),
            1 << 30,
            "expected 2^30 for 0.5; 2^29 is the same half-scale mistake - check the shift is 31, "
            "not 30",
        )

    def test_the_worked_angle_encoding(self):
        # theta_e = pi/3 normalises to 1/3, and (1/3) * 2^31 = 715 827 882.67.
        self.assertEqual(
            submission.angle_to_q31(math.pi / 3.0),
            715827883,
            "expected 715827883 for theta/pi = 1/3; half of it means the angle was normalised then "
            "scaled by 2^30 - check the scale and the rounding",
        )

    def test_the_skip_test_quarter(self):
        self.assertEqual(
            submission.q31_encode(0.25),
            536870912,
            "expected 536870912 for 0.25; 268435456 is the 2^30 scale error - check the constant "
            "the encoder multiplies by",
        )
        self.assertEqual(
            submission.q31_encode(0.25),
            1 << 29,
            "expected 2^29 for 0.25; 2^28 means the same scale error - check the shift width",
        )

    def test_the_exercise_minus_half(self):
        self.assertEqual(
            submission.q31_encode(-0.50),
            -1073741824,
            "expected -1073741824 for -0.5; a positive word means the sign was lost - check the "
            "encoding keeps the sign bit",
        )
        self.assertEqual(
            submission.q31_encode(-0.50),
            -(1 << 30),
            "expected -(2^30) for -0.5; -2^29 means the scale is wrong rather than the sign - "
            "check the shift",
        )

    def test_the_gate_test_minus_half_pi(self):
        # theta_e = -pi/2 normalises to -0.5.
        self.assertEqual(
            submission.angle_to_q31(-math.pi / 2.0),
            -1073741824,
            "expected -1073741824 for -pi/2; 0 likely means the angle was normalised with abs() - "
            "check the sign survives normalisation",
        )
        self.assertAlmostEqual(
            submission.angle_to_q31(-math.pi / 2.0) / float(1 << 31),
            -0.5,
            delta=1e-12,
            msg="expected the -pi/2 word to decode to -0.5; a positive ratio means the top bit was "
            "dropped - check the divisor and the sign",
        )

    def test_positive_one_overflows_into_the_minimum(self):
        # +2^31 does not fit in int32_t; the encoding clamps to 0x7FFFFFFF instead of wrapping.
        self.assertEqual(
            submission.q31_encode(1.0),
            2147483647,
            "expected 2147483647 for +1.0 rather than a wrap to INT32_MIN; a negative result means "
            "the clamp is missing - check saturation",
        )
        self.assertEqual(
            submission.q31_encode(1.0),
            (1 << 31) - 1,
            "expected 0x7FFFFFFF for +1.0; -2147483648 is a wrap, not a clamp - check the "
            "saturating cast",
        )
        self.assertNotEqual(
            submission.q31_encode(1.0),
            -2147483648,
            "expected +1.0 not to encode as INT32_MIN; a wrapped value means the clamp was removed "
            "- check the positive boundary",
        )

    def test_minus_one_is_exactly_representable(self):
        self.assertEqual(
            submission.q31_encode(-1.0),
            -2147483648,
            "expected INT32_MIN for -1.0; a positive value means the sign bit was dropped - check "
            "the negative boundary",
        )

    def test_decoding_round_trips(self):
        self.assertAlmostEqual(
            submission.q31_decode(1073741824),
            0.5,
            delta=1e-15,
            msg="expected decode(2^30) to return 0.5; a value near 1.0 likely divided by 2^30 - "
            "check the divisor is 2^31",
        )
        self.assertAlmostEqual(
            submission.q31_decode(-1073741824),
            -0.5,
            delta=1e-15,
            msg="expected decode(-2^30) to return -0.5; a positive value means the sign was lost - "
            "check the sign of the word reaches the result",
        )
        self.assertAlmostEqual(
            submission.q31_decode((1 << 31) - 1),
            1.0 - 2.0 ** -31,
            delta=1e-15,
            msg="expected decode(INT32_MAX) to return 1 - 2^-31; exactly 1.0 means the divisor is "
            "too small - check the decode scale",
        )

    def test_an_angle_outside_the_normalised_range_is_refused(self):
        # x = theta / pi lives in [-1, 1): +pi maps to the one value the range excludes, while
        # -pi is the same physical angle and is representable exactly.
        with self.assertRaises(ValueError):
            submission.angle_to_q31(math.pi)
        self.assertEqual(
            submission.angle_to_q31(-math.pi),
            -(1 << 31),
            "expected -pi to encode to INT32_MIN while +pi is refused; a positive word means the "
            "range test is one-sided - check the half-open interval",
        )
        with self.assertRaises(ValueError):
            submission.angle_to_q31(3.5)

    def test_a_word_outside_int32_is_refused(self):
        with self.assertRaises(ValueError):
            submission.q31_decode(1 << 31)
        with self.assertRaises(ValueError):
            submission.q31_decode(-(1 << 31) - 1)


class SeqLockTests(unittest.TestCase):
    def test_a_clean_read_is_valid(self):
        self.assertTrue(
            submission.seqlock_valid(4, 4),
            "expected an unchanged even sequence to be a clean read; False means the parity test "
            "is inverted - check the even/odd condition",
        )
        self.assertTrue(
            submission.seqlock_valid(0, 0),
            "expected sequence 0 to be a clean read; a False here likely rejects zero as 'no "
            "write' - check there is no special case for it",
        )

    def test_an_odd_snapshot_is_torn(self):
        # The writer flipped 4 -> 5 and has not finished: even though the counter never moved
        # between s1 and s2, the payload is mid-write.
        self.assertFalse(
            submission.seqlock_valid(5, 5),
            "expected an odd snapshot to be rejected even when s1 equals s2; accepting it means "
            "only equality is checked - check the parity too",
        )
        self.assertFalse(
            submission.seqlock_valid(1, 1),
            "expected sequence 1 to be rejected as write-in-flight; accepting it means the odd test "
            "is missing - check s1 % 2",
        )

    def test_a_writer_between_the_two_reads_is_torn(self):
        # s1 = 4, then 4 -> 5 -> 6 during the copy: the retry is the fix.
        self.assertFalse(
            submission.seqlock_valid(4, 6),
            "expected a writer between the two reads to be caught; 4 vs 6 passing means the "
            "equality test is missing - check s1 == s2",
        )
        self.assertFalse(
            submission.seqlock_valid(12, 14),
            "expected 12 vs 14 to be caught as a torn read; accepting it means only parity is "
            "checked - check both conditions are required",
        )

    def test_three_complete_writes_leave_an_even_counter(self):
        # The Gate test: 0 -> 2 -> 4 -> 6, and a reader at 6 accepts its copy.
        seq = 0
        for _write in range(3):
            seq += 2
        self.assertEqual(
            seq,
            6,
            "expected three complete writes to leave 6; another value likely counts one increment "
            "per write - check each write adds 2",
        )
        self.assertTrue(
            submission.seqlock_valid(seq, seq),
            "expected an even counter after three writes to be a valid read; False means the "
            "reader rejects complete writes - check the parity",
        )
        self.assertFalse(
            submission.seqlock_valid(seq - 1, seq - 1),
            "expected the odd counter just before 6 to be rejected; accepting it means the reader "
            "ignores parity - check the write-in-flight case",
        )

    def test_a_negative_sequence_is_refused(self):
        with self.assertRaises(ValueError):
            submission.seqlock_valid(-2, -2)


class CpuTests(unittest.TestCase):
    def test_the_gate_test_cpu_percentage(self):
        # 100 * 3.0 us / 25.0 us = 12%.
        self.assertAlmostEqual(
            submission.isr_cpu_percent(3.0, 25.0),
            12.0,
            delta=1e-9,
            msg="expected 12% for 3.0 us of a 25.0 us period; 0.12 means the result is a fraction "
            "- check the multiply by 100",
        )

    def test_a_tenth_of_the_period_is_ten_percent(self):
        self.assertAlmostEqual(
            submission.isr_cpu_percent(2.5, 25.0),
            10.0,
            delta=1e-12,
            msg="expected 10% for 2.5 us of 25.0 us; 0.1 means the percentage scaling is missing - "
            "check the factor of 100",
        )

    def test_a_zero_period_or_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.isr_cpu_percent(3.0, 0.0)
        with self.assertRaises(ValueError):
            submission.isr_cpu_percent(0.0, 25.0)


if __name__ == "__main__":
    unittest.main()
