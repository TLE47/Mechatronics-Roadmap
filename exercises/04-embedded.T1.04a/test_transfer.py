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
        self.assertEqual(plant.ENCODER_CPR, 4096)
        self.assertEqual(submission.wrap_uint(plant.ENCODER_CPR, plant.ENCODER_BITS), 0)
        self.assertEqual(submission.wrap_uint(-1, plant.ENCODER_BITS), 4095)

    def test_a_rollover_is_sixteen_counts_forward(self):
        # 4090 -> 10 through the wrap is 16 counts forward, not 4080 back.
        self.assertEqual(submission.elapsed_unsigned(10, 4090, plant.ENCODER_BITS), 16)

    def test_the_encoder_range_is_4096_counts(self):
        self.assertEqual(submission.int_range(plant.ENCODER_BITS),
                         (0, plant.ENCODER_CPR - 1))


class MillisecondCounterTests(unittest.TestCase):
    def test_the_plant_tick_is_one_millisecond(self):
        self.assertAlmostEqual(plant.DT * 1000.0, 1.0, delta=1e-15)
        self.assertEqual(submission.elapsed_unsigned(1, 0, 16), 1)

    def test_a_thousand_ticks_is_one_second(self):
        self.assertEqual(plant.TICKS, 1000)
        self.assertEqual(submission.elapsed_unsigned(plant.TICKS, 0, 16), 1000)
        self.assertLess(plant.TICKS, 2 ** 16 - 1)


class ClampInMillinewtonMetresTests(unittest.TestCase):
    def test_the_clamp_fits_an_int16_in_millinewton_metres(self):
        low, high = submission.int_range(16, True)
        self.assertEqual(int(plant.TAU_LIMIT * 1000), 2500)
        self.assertTrue(low <= 2500 <= high)
        self.assertTrue(low <= int(plant.DIST_TAU1 * 1000) <= high)
        self.assertEqual(int(plant.DIST_TAU1 * 1000), -150)


class FrameOnThePlantTests(unittest.TestCase):
    def test_a_frame_carries_the_plants_fields(self):
        frame = submission.pack_telemetry(plant.TICKS, 2048, plant.TAU_LIMIT)
        self.assertEqual(len(frame), 8)
        tick, count, vel = submission.unpack_telemetry(frame)
        self.assertEqual((tick, count), (plant.TICKS, 2048))
        self.assertEqual(vel, 2.5)

    def test_the_frame_is_little_endian_like_the_uart(self):
        # uint16 1000, int16 0, float32 2.5 = 0x40200000.
        self.assertEqual(submission.pack_telemetry(plant.TICKS, 0, plant.TAU_LIMIT),
                         struct.pack("<Hhf", 1000, 0, 2.5))
        self.assertEqual(submission.pack_telemetry(plant.TICKS, 0, plant.TAU_LIMIT),
                         b"\xe8\x03\x00\x00\x00\x00\x20\x40")

    def test_a_config_register_keeps_its_neighbours(self):
        # A 32-bit config word with the encoder field cleared: only the low twelve bits move.
        before = 0xDEADBEEF
        after = submission.apply_bits(before, 0, plant.ENCODER_CPR - 1)
        self.assertEqual(after, 0xDEADB000)
        self.assertEqual(submission.bit_is_set(after, plant.ENCODER_BITS - 1), 0)
        self.assertEqual(submission.bit_is_set(after, 31), 1)


if __name__ == "__main__":
    unittest.main()
