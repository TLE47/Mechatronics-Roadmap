"""Transfer tests for 04-embedded.T2.04a - the same timings on the plant's own clock.

Six claims, measured against `resources/plants/mechalab_plant.py`:
  1. a 16-bit encoder frame at 10 MHz is 2 us, which is 0.2% of the plant's 1 ms control tick;
  2. the plant's encoder word is 12 bits, so its shift time is 1.2 us and its CPR is 2^12;
  3. at the plant's 1 kHz sample rate a four-sample half-buffer fires HT at 250 Hz, so 250 reads
     fit in one second of plant time (TICKS * DT = 1 s);
  4. a 320-bit telemetry frame (320 us of polling) fits one 1000 us tick at 32% load but
     overflows the 20 kHz loop by 6.44x;
  5. the half an ISR reads is the complement of where the engine writes next, and the two halves
     partition the buffer;
  6. every sample arrives in the CPU's list exactly once per 2N cycle.
"""

import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class EncoderFrameTests(unittest.TestCase):
    def test_the_encoder_frame_fits_inside_one_plant_tick(self):
        frame_us = submission.spi_frame_us(16, 10e6)
        self.assertAlmostEqual(frame_us, 2.0, delta=1e-12)
        self.assertAlmostEqual(submission.cpu_load_fraction(frame_us, plant.DT * 1e6),
                               0.002, delta=1e-15)
        self.assertLess(frame_us, plant.DT * 1e6)

    def test_the_plant_encoder_is_a_twelve_bit_word(self):
        self.assertEqual(plant.ENCODER_CPR, 2 ** plant.ENCODER_BITS)
        self.assertAlmostEqual(submission.spi_shift_us(plant.ENCODER_BITS, 10e6),
                               1.2, delta=1e-12)
        self.assertAlmostEqual(submission.spi_frame_us(plant.ENCODER_BITS, 10e6),
                               1.6, delta=1e-12)


class TickBudgetTests(unittest.TestCase):
    def test_the_plant_tick_rate_gives_one_ht_per_four_ticks(self):
        tick_hz = 1.0 / plant.DT
        self.assertAlmostEqual(tick_hz, 1000.0, delta=1e-9)
        self.assertAlmostEqual(submission.ht_frequency_hz(tick_hz, 4), 250.0, delta=1e-12)
        self.assertAlmostEqual(submission.ping_pong_window_us(4, tick_hz),
                               4000.0, delta=1e-9)

    def test_one_second_of_plant_time_holds_two_hundred_fifty_reads(self):
        self.assertAlmostEqual(plant.TICKS * plant.DT, 1.0, delta=1e-12)
        reads = submission.ht_frequency_hz(1.0 / plant.DT, 4) * (plant.TICKS * plant.DT)
        self.assertAlmostEqual(reads, 250.0, delta=1e-9)

    def test_a_telemetry_frame_fits_a_tick_but_not_the_fast_loop(self):
        self.assertAlmostEqual(submission.uart_poll_us(320, 1e6), 320.0, delta=1e-9)
        self.assertAlmostEqual(submission.cpu_load_fraction(320.0, plant.DT * 1e6),
                               0.32, delta=1e-12)
        # 320 us of work in a 50 us loop is 6.4 loops' worth of CPU: the frame cannot ride there.
        self.assertAlmostEqual(submission.cpu_load_fraction(320.0, 50.0), 6.4, delta=1e-12)
        # Offloading the same frame to DMA costs 0.5 us of setup, 0.05% of the tick.
        self.assertAlmostEqual(submission.cpu_load_fraction(0.5, plant.DT * 1e6),
                               0.0005, delta=1e-15)


class BufferCycleTests(unittest.TestCase):
    def test_the_read_half_is_where_the_next_write_is_not(self):
        n_half = 4
        for write_pos in range(2 * n_half):
            readable = submission.buffer_slice_for_position(write_pos, n_half)
            if readable is None:
                continue
            start, stop = readable
            self.assertEqual(stop - start, n_half)
            # The engine's next write is the first index of the other half.
            self.assertEqual(write_pos + 1, stop)
            other = (stop, 2 * n_half) if start == 0 else (0, n_half)
            self.assertNotEqual(readable, other)

    def test_the_two_halves_partition_the_buffer(self):
        n_half = 4
        ping = submission.buffer_slice_for_position(n_half - 1, n_half)
        pong = submission.buffer_slice_for_position(2 * n_half - 1, n_half)
        covered = list(range(ping[0], ping[1])) + list(range(pong[0], pong[1]))
        self.assertEqual(sorted(covered), list(range(2 * n_half)))
        self.assertEqual(len(set(covered)), 2 * n_half)

    def test_every_sample_is_read_once_per_cycle(self):
        n_half, total = 4, 8
        buffer = [0] * total
        processed = []
        for sample_index in range(total):
            write_pos = sample_index % total
            buffer[write_pos] = sample_index
            readable = submission.buffer_slice_for_position(write_pos, n_half)
            if readable is not None:
                processed.extend(buffer[readable[0]:readable[1]])
        self.assertEqual(processed, list(range(total)))


if __name__ == "__main__":
    unittest.main()
