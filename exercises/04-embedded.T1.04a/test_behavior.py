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
        self.assertEqual(
            submission.int_range(16, True),
            (-32768, 32767),
            "expected the int16 range to run -32768 to 32767; a top of 32768 likely used 2**15 "
            "instead of 2**15 - 1 - check the signed branch subtracts one from the high end",
        )

    def test_an_unsigned_byte_spans_zero_to_255(self):
        self.assertEqual(
            submission.int_range(8),
            (0, 255),
            "expected an 8-bit unsigned range of 0 to 255; a 0 to 256 answer likely computed 2**8 "
            "without subtracting one - check the maximum is 2**width - 1",
        )

    def test_the_uint32_top_is_4294967295(self):
        self.assertEqual(
            submission.int_range(32, False)[1],
            4294967295,
            "expected the uint32 top to be 4294967295; a 4294967296 answer likely used 2**32 as "
            "the maximum - check the high end includes the minus one",
        )

    def test_unsigned_is_the_default(self):
        self.assertEqual(
            submission.int_range(8),
            submission.int_range(8, False),
            "expected the unsigned default to match an explicit signed=False call; a difference "
            "likely means the default flips the flag - check the signature's default argument",
        )

    def test_a_zero_width_is_refused(self):
        with self.assertRaises(ValueError):
            submission.int_range(0)

    def test_a_width_past_64_bits_is_refused(self):
        with self.assertRaises(ValueError):
            submission.int_range(65, True)


class WrapTests(unittest.TestCase):
    def test_the_worked_rollover_elapsed(self):
        # Worked example: now = 4, prev = 65530, 16-bit counter -> ten ticks.
        self.assertEqual(
            submission.elapsed_unsigned(4, 65530, 16),
            10,
            "expected 10 ticks from 65530 to 4 on a 16-bit counter; -65526 likely means the "
            "difference was taken in signed Python - check the subtraction is masked to the width",
        )

    def test_the_skip_test_eight_bit_difference(self):
        # Skip test Q2: (3 - 250) & 0xFF = 9.
        self.assertEqual(
            submission.elapsed_unsigned(3, 250, 8),
            9,
            "expected 9 ticks across the 8-bit wrap at 255; a 409 answer likely masked to 16 bits "
            "instead of 8 - check the mask width follows the counter width",
        )

    def test_a_uint16_keeps_sixteen_bits(self):
        self.assertEqual(
            submission.wrap_uint(0x1234, 16),
            0x1234,
            "expected 0x1234 to survive a 16-bit wrap unchanged; anything smaller likely masked "
            "with 0xFF - check the mask is 2**width - 1, not a fixed byte",
        )
        self.assertEqual(
            submission.wrap_uint(0xFFFF, 16),
            65535,
            "expected 0xFFFF to stay 65535 after a 16-bit wrap; 255 likely truncated to a byte - "
            "check the mask covers the full width",
        )

    def test_a_counter_wrapping_to_zero(self):
        self.assertEqual(
            submission.wrap_uint(65536, 16),
            0,
            "expected one full 16-bit turn to wrap to 0; 65536 kept as-is likely skipped the mask "
            "- check the modulo happens on every call",
        )
        self.assertEqual(
            submission.wrap_uint(65537, 16),
            1,
            "expected 65537 to wrap to 1 on a 16-bit counter; 17 likely cleared only one byte - "
            "check the mask width in the subtraction",
        )

    def test_a_negative_assignment_wraps_to_the_top(self):
        # The odometer metaphor: one click back from 0 is the top of the range.
        self.assertEqual(
            submission.wrap_uint(-1, 16),
            65535,
            "expected one click below zero to wrap to 65535; -1 returned as-is likely never masked "
            "- check the value is reduced modulo 2**width",
        )
        self.assertEqual(
            submission.wrap_uint(-1, 8),
            255,
            "expected one click below zero to wrap to 255 in 8 bits; 65535 likely hard-coded the "
            "16-bit width - check the width argument is used",
        )

    def test_an_eight_bit_difference_across_rollover(self):
        self.assertEqual(
            submission.elapsed_unsigned(0, 250, 8),
            6,
            "expected 6 ticks from 250 to 0 through the 8-bit wrap; -250 likely subtracted signed "
            "- check the mask is applied before the answer leaves",
        )

    def test_a_zero_width_elapsed_is_refused(self):
        with self.assertRaises(ValueError):
            submission.elapsed_unsigned(1, 0, 0)


class MaskTests(unittest.TestCase):
    def test_the_exercise_register(self):
        # §5: set bit 6 (already set in 0x5A) and clear bit 3 -> 0x52. A form that XORs instead
        # of ORs would flip that neighbour off and report 0x12.
        self.assertEqual(
            submission.apply_bits(0x5A, 1 << 6, 1 << 3),
            0x52,
            "expected 0x52 after setting bit 6 and clearing bit 3 of 0x5A; 0x12 likely XORed "
            "instead of ORing the set mask - check the set uses | and the clear uses & ~",
        )
        self.assertEqual(
            submission.apply_bits(0x5A, 1 << 6, 1 << 3),
            82,
            "expected the register to read 82 decimal, the same 0x52; a different decimal likely "
            "means a different binary result - check the hex and decimal agree",
        )

    def test_the_worked_example_set_and_clear(self):
        self.assertEqual(
            submission.apply_bits(0b0000_0001, 1 << 3),
            9,
            "expected setting bit 3 of 0b0001 to give 9; 1 returned likely skipped the set mask "
            "- check the default clear mask is zero, not the set mask",
        )
        self.assertEqual(
            submission.apply_bits(9, 0, 1 << 0),
            8,
            "expected clearing bit 0 of 9 to give 8; 9 returned likely cleared with the mask "
            "instead of its complement - check the clear uses & ~clear_mask",
        )

    def test_the_skip_test_clear(self):
        # Skip test Q3: 0x0F with bit 2 cleared is 11.
        self.assertEqual(
            submission.apply_bits(0x0F, 0, 1 << 2),
            11,
            "expected 0x0F with bit 2 cleared to read 11; 7 likely cleared bit 3 instead - check "
            "the mask is 1 << 2 before inverting it",
        )

    def test_clearing_wins_over_setting(self):
        self.assertEqual(
            submission.apply_bits(0x00, 1 << 5, 1 << 5),
            0x00,
            "expected a bit that is both set and cleared to end cleared; 0x20 likely applied the "
            "set last - check the clear is the final operation",
        )

    def test_a_negative_mask_is_refused(self):
        with self.assertRaises(ValueError):
            submission.apply_bits(0x5A, -1, 0)


class BitTests(unittest.TestCase):
    def test_the_worked_example_test_bit(self):
        self.assertEqual(
            submission.bit_is_set(8, 3),
            1,
            "expected bit 3 of 8 to read 1; 0 likely shifted the wrong way - check the value is "
            "shifted right by the index before masking",
        )

    def test_a_clear_bit_reads_zero(self):
        self.assertEqual(
            submission.bit_is_set(0x52, 3),
            0,
            "expected bit 3 of 0x52 to read 0; 1 likely tested bit 2 - check the index counts "
            "from zero at the least significant bit",
        )

    def test_bit_thirty_one_of_a_uint32(self):
        self.assertEqual(
            submission.bit_is_set(0x80000000, 31),
            1,
            "expected bit 31 of 0x80000000 to read 1; 0 likely masked with a 16-bit value - check "
            "the mask covers the full 32 bits",
        )
        self.assertEqual(
            submission.bit_is_set(0x7FFFFFFF, 31),
            0,
            "expected bit 31 of 0x7FFFFFFF to read 0; 1 likely tested a sign bit after conversion "
            "- check the test stays in unsigned arithmetic",
        )

    def test_a_bit_index_past_31_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bit_is_set(0x01, 32)


class TelemetryTests(unittest.TestCase):
    def test_the_frame_is_eight_bytes(self):
        # 2 + 2 + 4 bytes, exactly what the packed C struct sends.
        self.assertEqual(
            len(submission.pack_telemetry(1000, -512, 3.25)),
            8,
            "expected 2 + 2 + 4 = 8 bytes; 12 likely padded the float to double - check the pack "
            "format is <Hhf with no alignment",
        )

    def test_the_frame_bytes_are_little_endian(self):
        # uint16 1000 = 0x03E8, int16 -512 = 0xFE00, float32 3.25 = 0x40500000.
        self.assertEqual(
            submission.pack_telemetry(1000, -512, 3.25),
            b"\xe8\x03\x00\xfe\x00\x00\x50\x40",
            "expected little-endian bytes e8 03 00 fe 00 00 50 40; 03 e8 ... likely packed "
            "big-endian - check the format string starts with <",
        )

    def test_the_frame_round_trips(self):
        tick, count, vel = submission.unpack_telemetry(
            submission.pack_telemetry(1000, -512, 3.25))
        self.assertEqual(
            (tick, count),
            (1000, -512),
            "expected the tick and count to survive the round trip as (1000, -512); (256000, ...) "
            "likely byte-swapped the fields - check pack and unpack use the same format",
        )
        self.assertAlmostEqual(
            vel,
            3.25,
            delta=1e-6,
            msg="expected the velocity to round-trip as 3.25; a wildly different float likely "
            "shares a slot with the int16 - check the field order matches the C struct",
        )

    def test_the_signed_count_round_trips_at_its_limit(self):
        tick, count, vel = submission.unpack_telemetry(submission.pack_telemetry(0, -32768, 0.0))
        self.assertEqual(
            (tick, count, vel),
            (0, -32768, 0.0),
            "expected -32768 to survive as the int16 minimum; 32768 likely unpacked as unsigned "
            "- check the count field uses h, not H",
        )

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
