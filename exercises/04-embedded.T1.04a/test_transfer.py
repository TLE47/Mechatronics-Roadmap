"""Transfer tests for 04-embedded.T1.04a - the same wrapping, masking and framing on the plant.

Three claims, measured against `resources/plants/mechalab_plant.py`:
  1. its 12-bit encoder is a `uint12_t`: 4096 counts wrap to 0, and the rollover-safe difference
     across that wrap is the number of counts actually turned;
  2. its 1 kHz tick is a uint16 millisecond counter: one tick is 1 ms, and the capstone's
     1000-tick run is 1000 ms - still comfortably inside the counter;
  3. its 2.5 N*m clamp and -0.15 N*m pulse fit an int16 in millinewton-metres, and the telemetry
     frame that carries them is the little-endian `<Hhf` layout the UART sends.
"""

import struct
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class EncoderWrapTests(unittest.TestCase):
    def test_the_encoder_wraps_at_4096(self):
        self.assertEqual(
            plant.ENCODER_CPR,
            4096,
            "expected the plant's 12-bit encoder to declare 4096 counts per turn; a different "
            "constant likely means the encoder model changed - check ENCODER_CPR in the plant",
        )
        self.assertEqual(
            submission.wrap_uint(plant.ENCODER_CPR, plant.ENCODER_BITS),
            0,
            "expected exactly 4096 counts to wrap to 0; 4096 returned likely skipped the mask - "
            "check the wrap uses 2**12 - 1",
        )
        self.assertEqual(
            submission.wrap_uint(-1, plant.ENCODER_BITS),
            4095,
            "expected one count below zero to wrap to 4095; 65535 likely used 16 bits instead of "
            "the encoder's 12 - check the width comes from ENCODER_BITS",
        )

    def test_a_rollover_is_sixteen_counts_forward(self):
        # 4090 -> 10 through the wrap is 16 counts forward, not 4080 back.
        self.assertEqual(
            submission.elapsed_unsigned(10, 4090, plant.ENCODER_BITS),
            16,
            "expected 16 counts forward from 4090 to 10 through the wrap; -4080 likely subtracted "
            "signed - check the difference is masked to 12 bits",
        )

    def test_the_encoder_range_is_4096_counts(self):
        self.assertEqual(
            submission.int_range(plant.ENCODER_BITS),
            (0, plant.ENCODER_CPR - 1),
            "expected the 12-bit unsigned range 0 to 4095; a top of 4096 likely used 2**12 as the "
            "maximum - check the high end subtracts one",
        )


class MillisecondCounterTests(unittest.TestCase):
    def test_the_plant_tick_is_one_millisecond(self):
        self.assertAlmostEqual(
            plant.DT * 1000.0,
            1.0,
            delta=1e-15,
            msg="expected the plant's DT to be one millisecond when scaled; 0.001 or 1000 likely "
            "means DT is already in ms - check the unit DT is stored in",
        )
        self.assertEqual(
            submission.elapsed_unsigned(1, 0, 16),
            1,
            "expected one tick of elapsed time; 65536 likely subtracted before masking - check the "
            "mask applies to the difference",
        )

    def test_a_thousand_ticks_is_one_second(self):
        self.assertEqual(
            plant.TICKS,
            1000,
            "expected the capstone run to be 1000 ticks; a different count likely means the run "
            "length changed - check TICKS in the plant",
        )
        self.assertEqual(
            submission.elapsed_unsigned(plant.TICKS, 0, 16),
            1000,
            "expected the 1000-tick run to measure 1000 ms; 0 likely wrapped the counter past its "
            "range - check the difference stays in 16 bits",
        )
        self.assertLess(
            plant.TICKS,
            2 ** 16 - 1,
            "expected the run to stay inside an unsigned 16-bit counter; a larger value likely "
            "means the counter needs widening - check the tick count against 65535",
        )


class ClampInMillinewtonMetresTests(unittest.TestCase):
    def test_the_clamp_fits_an_int16_in_millinewton_metres(self):
        low, high = submission.int_range(16, True)
        self.assertEqual(
            int(plant.TAU_LIMIT * 1000),
            2500,
            "expected the 2.5 N*m clamp to be 2500 millinewton-metres; 2 or 25000 likely scaled "
            "by the wrong factor - check the multiply by 1000 happens once",
        )
        self.assertTrue(
            low <= 2500 <= high,
            "expected 2500 mN*m to fit the int16 range; falling outside likely means the clamp "
            "was compared in raw newton-metres - check both sides use the same unit",
        )
        self.assertTrue(
            low <= int(plant.DIST_TAU1 * 1000) <= high,
            "expected the -150 mN*m disturbance pulse to fit int16; falling outside likely means "
            "the pulse is stored as a float - check the conversion to integer units",
        )
        self.assertEqual(
            int(plant.DIST_TAU1 * 1000),
            -150,
            "expected the -0.15 N*m pulse to be -150 mN*m; a positive 150 likely dropped the sign "
            "- check the disturbance direction is kept",
        )


class FrameOnThePlantTests(unittest.TestCase):
    def test_a_frame_carries_the_plants_fields(self):
        frame = submission.pack_telemetry(plant.TICKS, 2048, plant.TAU_LIMIT)
        self.assertEqual(
            len(frame),
            8,
            "expected the plant frame to be 2 + 2 + 4 bytes; 12 likely packed a double - check the "
            "format keeps f as float32",
        )
        tick, count, vel = submission.unpack_telemetry(frame)
        self.assertEqual(
            (tick, count),
            (plant.TICKS, 2048),
            "expected the frame to carry the plant's own tick and count; a swapped pair likely "
            "means unpack reads the fields in a different order - check the format string",
        )
        self.assertEqual(
            vel,
            2.5,
            "expected the 2.5 N*m clamp to survive the round trip; a tiny float likely truncated "
            "the mantissa - check the field is float32, not float16",
        )

    def test_the_frame_is_little_endian_like_the_uart(self):
        # uint16 1000, int16 0, float32 2.5 = 0x40200000.
        self.assertEqual(
            submission.pack_telemetry(plant.TICKS, 0, plant.TAU_LIMIT),
            struct.pack("<Hhf", 1000, 0, 2.5),
            "expected the frame to equal struct.pack('<Hhf', 1000, 0, 2.5); a mismatch likely "
            "means the format dropped the < or swapped a field - check each character",
        )
        self.assertEqual(
            submission.pack_telemetry(plant.TICKS, 0, plant.TAU_LIMIT),
            b"\xe8\x03\x00\x00\x00\x00\x20\x40",
            "expected little-endian bytes e8 03 ... 20 40; 03 e8 ... likely packed big-endian - "
            "check the format starts with <",
        )

    def test_a_config_register_keeps_its_neighbours(self):
        # A 32-bit config word with the encoder field cleared: only the low twelve bits move.
        before = 0xDEADBEEF
        after = submission.apply_bits(before, 0, plant.ENCODER_CPR - 1)
        self.assertEqual(
            after,
            0xDEADB000,
            "expected only the low 12 bits of 0xDEADBEEF to clear, leaving 0xDEADB000; 0xDEAD0000 "
            "likely cleared 16 bits - check the clear mask width",
        )
        self.assertEqual(
            submission.bit_is_set(after, plant.ENCODER_BITS - 1),
            0,
            "expected the top encoder bit to read 0 after the clear; 1 likely means the mask "
            "stopped short - check bit 11 is included",
        )
        self.assertEqual(
            submission.bit_is_set(after, 31),
            1,
            "expected bit 31 to survive untouched; 0 likely means the clear mask was inverted "
            "over the whole word - check the neighbours are preserved",
        )


if __name__ == "__main__":
    unittest.main()
