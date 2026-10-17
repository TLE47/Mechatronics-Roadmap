"""Behaviour tests for 04-embedded.T2.04a.

Each test names the mistake it catches:
  * a frame time that forgets the chip-select overhead, reporting 1.6 us for a 2.0 us read;
  * a polled-UART cost divided by eight, treating 8N1 bits as bytes;
  * a ping-pong window built from the 2N total instead of the N half, doubling the 80 us the
    learner actually has;
  * a Half-Transfer rate divided by 2N, halving it;
  * a half-transfer ISR that reads the half the engine is still writing - the race the whole
    scheme exists to avoid.
"""

import unittest

import harness

submission = harness.load_submission()


class SpiTests(unittest.TestCase):
    def test_the_skip_test_shift_time(self):
        # 24 bits at 12 MHz: 2.0 us of clocks and nothing else.
        self.assertAlmostEqual(submission.spi_shift_us(24, 12e6), 2.0, delta=1e-12)

    def test_the_worked_shift_time(self):
        self.assertAlmostEqual(submission.spi_shift_us(16, 10e6), 1.6, delta=1e-12)

    def test_a_slow_clock_costs_milliseconds(self):
        self.assertAlmostEqual(submission.spi_shift_us(12, 1e6), 12.0, delta=1e-12)

    def test_the_worked_spi_frame(self):
        # 1.6 us of clocks + 0.4 us of chip-select = 2.0 us - the module's worked example.
        self.assertAlmostEqual(submission.spi_frame_us(16, 10e6, 0.4), 2.0, delta=1e-12)

    def test_the_default_overhead_is_the_workshop_value(self):
        self.assertAlmostEqual(submission.spi_frame_us(16, 10e6), 2.0, delta=1e-12)

    def test_a_24_bit_frame_costs_2_4_us(self):
        self.assertAlmostEqual(submission.spi_frame_us(24, 12e6, 0.4), 2.4, delta=1e-12)

    def test_zero_overhead_is_the_shift_time(self):
        for n_bits, f_sclk in ((16, 10e6), (24, 12e6), (12, 1e6)):
            self.assertAlmostEqual(submission.spi_frame_us(n_bits, f_sclk, 0.0),
                                   submission.spi_shift_us(n_bits, f_sclk), delta=1e-12)

    def test_bad_frames_are_refused(self):
        with self.assertRaises(ValueError):
            submission.spi_shift_us(0, 10e6)
        with self.assertRaises(ValueError):
            submission.spi_shift_us(16, 0.0)
        with self.assertRaises(ValueError):
            submission.spi_frame_us(16, 10e6, -0.1)


class PollingTests(unittest.TestCase):
    def test_the_worked_uart_poll(self):
        # 320 bits of 8N1 telemetry at 1 Mbps = 320 us of stalled CPU.
        self.assertAlmostEqual(submission.uart_poll_us(320, 1e6), 320.0, delta=1e-9)

    def test_the_skip_test_uart_poll(self):
        # 50 bytes of 8N1 is 500 bits, not 50: 500 us at 1 Mbps.
        self.assertAlmostEqual(submission.uart_poll_us(500, 1e6), 500.0, delta=1e-9)

    def test_ten_bytes_at_115200(self):
        self.assertAlmostEqual(submission.uart_poll_us(80, 115200), 694.4444444444445, delta=1e-9)

    def test_the_worked_poll_overflows_a_twenty_kilohertz_loop(self):
        self.assertAlmostEqual(submission.cpu_load_fraction(322.0, 50.0), 6.44, delta=1e-12)

    def test_dma_setup_is_one_percent_of_the_loop(self):
        self.assertAlmostEqual(submission.cpu_load_fraction(0.5, 50.0), 0.01, delta=1e-12)

    def test_half_the_tick_is_half_the_load(self):
        self.assertAlmostEqual(submission.cpu_load_fraction(500.0, 1000.0), 0.5, delta=1e-12)

    def test_bad_loads_are_refused(self):
        with self.assertRaises(ValueError):
            submission.cpu_load_fraction(1.0, 0.0)
        with self.assertRaises(ValueError):
            submission.cpu_load_fraction(-1.0, 50.0)
        with self.assertRaises(ValueError):
            submission.uart_poll_us(0, 1e6)


class PingPongTests(unittest.TestCase):
    def test_the_exercise_window(self):
        # 16 samples at 200 kHz: 80 us, not the 160 us of the 32-sample total.
        self.assertAlmostEqual(submission.ping_pong_window_us(16, 200000), 80.0, delta=1e-9)

    def test_a_slow_adc_gives_a_long_window(self):
        self.assertAlmostEqual(submission.ping_pong_window_us(4, 1000), 4000.0, delta=1e-9)

    def test_the_skip_test_window(self):
        self.assertAlmostEqual(submission.ping_pong_window_us(32, 64000), 500.0, delta=1e-9)

    def test_the_skip_test_ht_rate(self):
        # 64 kHz over a 32-sample half: 2000 Hz, one HT every 500 us.
        self.assertAlmostEqual(submission.ht_frequency_hz(64000, 32), 2000.0, delta=1e-12)

    def test_the_exercise_ht_rate(self):
        self.assertAlmostEqual(submission.ht_frequency_hz(200000, 16), 12500.0, delta=1e-12)

    def test_the_ht_rate_times_the_window_is_one(self):
        # The HT period is exactly the window: read the half before the other one fills.
        window_s = submission.ping_pong_window_us(16, 200000) / 1e6
        self.assertAlmostEqual(submission.ht_frequency_hz(200000, 16) * window_s, 1.0, delta=1e-12)

    def test_the_half_transfer_reads_ping(self):
        self.assertEqual(submission.buffer_slice_for_position(3, 4), (0, 4))

    def test_the_transfer_complete_reads_pong(self):
        self.assertEqual(submission.buffer_slice_for_position(7, 4), (4, 8))

    def test_mid_half_is_not_safe_to_read(self):
        for write_pos in (0, 1, 2, 4, 5, 6):
            self.assertIsNone(submission.buffer_slice_for_position(write_pos, 4), write_pos)

    def test_out_of_range_and_bad_halves_are_refused(self):
        with self.assertRaises(ValueError):
            submission.buffer_slice_for_position(8, 4)
        with self.assertRaises(ValueError):
            submission.buffer_slice_for_position(-1, 4)
        with self.assertRaises(ValueError):
            submission.buffer_slice_for_position(3, 0)

    def test_sixteen_samples_are_replayed_in_order(self):
        # The worked example, graded: 2N = 8, N = 4, samples 10, 20, ... 160.
        n_half, total = 4, 8
        buffer = [0] * total
        processed, interrupts = [], []
        for sample_index in range(16):
            write_pos = sample_index % total
            buffer[write_pos] = (sample_index + 1) * 10
            readable = submission.buffer_slice_for_position(write_pos, n_half)
            if readable is not None:
                interrupts.append(readable)
                processed.extend(buffer[readable[0]:readable[1]])
        self.assertEqual(processed, [(k + 1) * 10 for k in range(16)])
        self.assertEqual(interrupts, [(0, 4), (4, 8), (0, 4), (4, 8)])


if __name__ == "__main__":
    unittest.main()
