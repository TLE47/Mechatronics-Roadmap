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
        self.assertAlmostEqual(
            frame_us, 2.0, delta=1e-12,
            msg="expected the plant's 16-bit encoder frame at 10 MHz to be 2.0 us; 1.6 likely "
                "forgot the 0.4 us chip-select - check spi_frame_us adds the overhead",
        )
        self.assertAlmostEqual(
            submission.cpu_load_fraction(frame_us, plant.DT * 1e6), 0.002, delta=1e-15,
            msg="expected the 2 us frame to be 0.2 percent of the plant's 1000 us tick; 2.0 "
                "likely compared against DT in seconds - check DT * 1e6",
        )
        self.assertLess(
            frame_us, plant.DT * 1e6,
            msg="expected the encoder frame to finish inside one 1000 us plant tick; a larger "
                "frame likely used a slower clock - check 10 MHz",
        )

    def test_the_plant_encoder_is_a_twelve_bit_word(self):
        self.assertEqual(
            plant.ENCODER_CPR, 2 ** plant.ENCODER_BITS,
            msg="expected the plant's counts per revolution to be 2 raised to its bit width, "
                "4096; another value likely multiplied by 4 for quadrature - check the plant",
        )
        self.assertAlmostEqual(
            submission.spi_shift_us(plant.ENCODER_BITS, 10e6), 1.2, delta=1e-12,
            msg="expected the plant's 12-bit word at 10 MHz to shift in 1.2 us; 0.83 likely "
                "used 12 bytes - check bits over clock",
        )
        self.assertAlmostEqual(
            submission.spi_frame_us(plant.ENCODER_BITS, 10e6), 1.6, delta=1e-12,
            msg="expected the 1.2 us shift plus 0.4 us overhead to be 1.6 us; 1.2 likely "
                "dropped the chip-select - check the default overhead",
        )


class TickBudgetTests(unittest.TestCase):
    def test_the_plant_tick_rate_gives_one_ht_per_four_ticks(self):
        tick_hz = 1.0 / plant.DT
        self.assertAlmostEqual(
            tick_hz, 1000.0, delta=1e-9,
            msg="expected the plant's 1 ms step to be a 1 kHz tick; a value near 1.0 or 1e6 "
                "likely read DT in the wrong units - check 1 / plant.DT",
        )
        self.assertAlmostEqual(
            submission.ht_frequency_hz(tick_hz, 4), 250.0, delta=1e-12,
            msg="expected four-sample halves at 1 kHz to fire HT at 250 Hz; 125 likely divided "
                "by the 8-sample total - check f_sample / n_half",
        )
        self.assertAlmostEqual(
            submission.ping_pong_window_us(4, tick_hz), 4000.0, delta=1e-9,
            msg="expected four samples at 1 kHz to give a 4000 us window; 8000 likely used the "
                "whole buffer - check the half length",
        )

    def test_one_second_of_plant_time_holds_two_hundred_fifty_reads(self):
        self.assertAlmostEqual(
            plant.TICKS * plant.DT, 1.0, delta=1e-12,
            msg="expected the plant's tick count times its step to be exactly one second; another "
                "value likely mixed TICKS with a different DT - check both are the plant's own",
        )
        reads = submission.ht_frequency_hz(1.0 / plant.DT, 4) * (plant.TICKS * plant.DT)
        self.assertAlmostEqual(
            reads, 250.0, delta=1e-9,
            msg="expected 250 half-buffer reads in one second of plant time; 500 likely used "
                "the total buffer length - check 250 Hz times one second",
        )

    def test_a_telemetry_frame_fits_a_tick_but_not_the_fast_loop(self):
        self.assertAlmostEqual(
            submission.uart_poll_us(320, 1e6), 320.0, delta=1e-9,
            msg="expected the 320-bit telemetry frame at 1 Mbps to cost 320 us; 40 likely "
                "divided by the eight bits per 8N1 byte - check the argument is bits",
        )
        self.assertAlmostEqual(
            submission.cpu_load_fraction(320.0, plant.DT * 1e6), 0.32, delta=1e-12,
            msg="expected 320 us of polling to be 32 percent of the plant's 1000 us tick; 3.2 "
                "likely used DT in seconds - check DT * 1e6",
        )
        # 320 us of work in a 50 us loop is 6.4 loops' worth of CPU: the frame cannot ride there.
        self.assertAlmostEqual(
            submission.cpu_load_fraction(320.0, 50.0), 6.4, delta=1e-12,
            msg="expected 320 us in a 50 us loop to be 6.4 loops of load; 0.156 likely inverted "
                "the ratio - check busy time over period",
        )
        # Offloading the same frame to DMA costs 0.5 us of setup, 0.05% of the tick.
        self.assertAlmostEqual(
            submission.cpu_load_fraction(0.5, plant.DT * 1e6), 0.0005, delta=1e-15,
            msg="expected 0.5 us of DMA setup to be 0.05 percent of the plant tick; 0.05 likely "
                "left the fraction as a percent - check the load is a fraction",
        )


class BufferCycleTests(unittest.TestCase):
    def test_the_read_half_is_where_the_next_write_is_not(self):
        n_half = 4
        for write_pos in range(2 * n_half):
            readable = submission.buffer_slice_for_position(write_pos, n_half)
            if readable is None:
                continue
            start, stop = readable
            self.assertEqual(
                stop - start, n_half,
                msg="expected every readable slice in this loop to be exactly one half, four "
                    "samples; another length likely returned the whole buffer - check the slice "
                    "bounds",
            )
            # The engine's next write is the first index of the other half.
            self.assertEqual(
                write_pos + 1, stop,
                msg="expected the engine's next write to land on the far end of the released "
                    "half; a mismatch likely released the half being written - check the "
                    "boundary",
            )
            other = (stop, 2 * n_half) if start == 0 else (0, n_half)
            self.assertNotEqual(
                readable, other,
                msg="expected every readable slice in this loop to be the complement of the "
                    "engine's half; equality means the ISR would read the half still filling",
            )

    def test_the_two_halves_partition_the_buffer(self):
        n_half = 4
        ping = submission.buffer_slice_for_position(n_half - 1, n_half)
        pong = submission.buffer_slice_for_position(2 * n_half - 1, n_half)
        covered = list(range(ping[0], ping[1])) + list(range(pong[0], pong[1]))
        self.assertEqual(
            sorted(covered), list(range(2 * n_half)),
            msg="expected Ping and Pong together to cover all 8 indices exactly once; a missing "
                "or doubled index likely overlapped the halves - check they are complements",
        )
        self.assertEqual(
            len(set(covered)), 2 * n_half,
            msg="expected 8 distinct samples across the two halves; fewer means the slices "
                "overlap and one sample would never be read - check the partition",
        )

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
        self.assertEqual(
            processed, list(range(total)),
            msg="expected each of the 8 samples once, in order; a repeated or skipped index "
                "likely means the readable half did not alternate - check the HT/TC positions",
        )


if __name__ == "__main__":
    unittest.main()
