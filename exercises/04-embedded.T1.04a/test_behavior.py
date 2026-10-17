"""Behaviour tests for 04-embedded.T1.04a.

Each test names the mistake it catches:
  * a tick difference taken without the width mask, which returns -65526 where the rollover
    arithmetic gives 10;
  * a clear written `& clear_mask` instead of `& ~clear_mask`, which leaves 0x08 where the
    module's exercise promises 0x52;
  * a signed range one off at the top (32768, and a `int16_t` that could hold it);
  * a wrap that always masks a byte, so a `uint16_t` silently loses its upper half;
  * a frame packed big-endian and read little-endian, which round-trips to the wrong numbers.
"""

import unittest

import harness

submission = harness.load_submission()


class IntegerRangeTests(unittest.TestCase):
    def test_the_int16_bounds(self):
        # Skip test Q1: 2**15 - 1.
        self.assertEqual(submission.int_range(16, True), (-32768, 32767))

    def test_an_unsigned_byte_spans_zero_to_255(self):
        self.assertEqual(submission.int_range(8), (0, 255))

    def test_the_uint32_top_is_4294967295(self):
        self.assertEqual(submission.int_range(32, False)[1], 4294967295)

    def test_unsigned_is_the_default(self):
        self.assertEqual(submission.int_range(8), submission.int_range(8, False))

    def test_a_zero_width_is_refused(self):
        with self.assertRaises(ValueError):
            submission.int_range(0)

    def test_a_width_past_64_bits_is_refused(self):
        with self.assertRaises(ValueError):
            submission.int_range(65, True)


class WrapTests(unittest.TestCase):
    def test_the_worked_rollover_elapsed(self):
        # Worked example: now = 4, prev = 65530, 16-bit counter -> ten ticks.
        self.assertEqual(submission.elapsed_unsigned(4, 65530, 16), 10)

    def test_the_skip_test_eight_bit_difference(self):
        # Skip test Q2: (3 - 250) & 0xFF = 9.
        self.assertEqual(submission.elapsed_unsigned(3, 250, 8), 9)

    def test_a_uint16_keeps_sixteen_bits(self):
        self.assertEqual(submission.wrap_uint(0x1234, 16), 0x1234)
        self.assertEqual(submission.wrap_uint(0xFFFF, 16), 65535)

    def test_a_counter_wrapping_to_zero(self):
        self.assertEqual(submission.wrap_uint(65536, 16), 0)
        self.assertEqual(submission.wrap_uint(65537, 16), 1)

    def test_a_negative_assignment_wraps_to_the_top(self):
        # The odometer metaphor: one click back from 0 is the top of the range.
        self.assertEqual(submission.wrap_uint(-1, 16), 65535)
        self.assertEqual(submission.wrap_uint(-1, 8), 255)

    def test_an_eight_bit_difference_across_rollover(self):
        self.assertEqual(submission.elapsed_unsigned(0, 250, 8), 6)

    def test_a_zero_width_elapsed_is_refused(self):
        with self.assertRaises(ValueError):
            submission.elapsed_unsigned(1, 0, 0)


class MaskTests(unittest.TestCase):
    def test_the_exercise_register(self):
        # §5: set bit 6 (already set in 0x5A) and clear bit 3 -> 0x52. A form that XORs instead
        # of ORs would flip that neighbour off and report 0x12.
        self.assertEqual(submission.apply_bits(0x5A, 1 << 6, 1 << 3), 0x52)
        self.assertEqual(submission.apply_bits(0x5A, 1 << 6, 1 << 3), 82)

    def test_the_worked_example_set_and_clear(self):
        self.assertEqual(submission.apply_bits(0b0000_0001, 1 << 3), 9)
        self.assertEqual(submission.apply_bits(9, 0, 1 << 0), 8)

    def test_the_skip_test_clear(self):
        # Skip test Q3: 0x0F with bit 2 cleared is 11.
        self.assertEqual(submission.apply_bits(0x0F, 0, 1 << 2), 11)

    def test_clearing_wins_over_setting(self):
        self.assertEqual(submission.apply_bits(0x00, 1 << 5, 1 << 5), 0x00)

    def test_a_negative_mask_is_refused(self):
        with self.assertRaises(ValueError):
            submission.apply_bits(0x5A, -1, 0)


class BitTests(unittest.TestCase):
    def test_the_worked_example_test_bit(self):
        self.assertEqual(submission.bit_is_set(8, 3), 1)

    def test_a_clear_bit_reads_zero(self):
        self.assertEqual(submission.bit_is_set(0x52, 3), 0)

    def test_bit_thirty_one_of_a_uint32(self):
        self.assertEqual(submission.bit_is_set(0x80000000, 31), 1)
        self.assertEqual(submission.bit_is_set(0x7FFFFFFF, 31), 0)

    def test_a_bit_index_past_31_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bit_is_set(0x01, 32)


class TelemetryTests(unittest.TestCase):
    def test_the_frame_is_eight_bytes(self):
        # 2 + 2 + 4 bytes, exactly what the packed C struct sends.
        self.assertEqual(len(submission.pack_telemetry(1000, -512, 3.25)), 8)

    def test_the_frame_bytes_are_little_endian(self):
        # uint16 1000 = 0x03E8, int16 -512 = 0xFE00, float32 3.25 = 0x40500000.
        self.assertEqual(submission.pack_telemetry(1000, -512, 3.25),
                         b"\xe8\x03\x00\xfe\x00\x00\x50\x40")

    def test_the_frame_round_trips(self):
        tick, count, vel = submission.unpack_telemetry(
            submission.pack_telemetry(1000, -512, 3.25))
        self.assertEqual((tick, count), (1000, -512))
        self.assertAlmostEqual(vel, 3.25, delta=1e-6)

    def test_the_signed_count_round_trips_at_its_limit(self):
        tick, count, vel = submission.unpack_telemetry(submission.pack_telemetry(0, -32768, 0.0))
        self.assertEqual((tick, count, vel), (0, -32768, 0.0))

    def test_a_tick_past_65535_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pack_telemetry(65536, 0, 0.0)

    def test_a_count_past_32767_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pack_telemetry(0, 32768, 0.0)

    def test_a_seven_byte_frame_is_refused(self):
        with self.assertRaises(ValueError):
            submission.unpack_telemetry(b"\x00" * 7)


if __name__ == "__main__":
    unittest.main()
