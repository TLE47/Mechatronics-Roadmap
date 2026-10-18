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
        self.assertAlmostEqual(
            submission.spi_shift_us(24, 12e6), 2.0, delta=1e-12,
            msg="expected 24 bits at 12 MHz to take 2.0 us of clocks; 0.5 likely inverted the "
                "clock and divided by 12 instead of 24 - check bits / f_sclk",
        )

    def test_the_worked_shift_time(self):
        self.assertAlmostEqual(
            submission.spi_shift_us(16, 10e6), 1.6, delta=1e-12,
            msg="expected 16 bits at 10 MHz to take 1.6 us; 1.0 likely used 16 bits as two "
                "bytes at 2 bits per byte - check bits / clock in microseconds",
        )

    def test_a_slow_clock_costs_milliseconds(self):
        self.assertAlmostEqual(
            submission.spi_shift_us(12, 1e6), 12.0, delta=1e-12,
            msg="expected 12 bits at 1 MHz to take 12 us; 0.012 likely forgot the 1e6 scaling - "
                "check the result is in microseconds",
        )

    def test_the_worked_spi_frame(self):
        # 1.6 us of clocks + 0.4 us of chip-select = 2.0 us - the module's worked example.
        self.assertAlmostEqual(
            submission.spi_frame_us(16, 10e6, 0.4), 2.0, delta=1e-12,
            msg="expected 1.6 us of clocks plus 0.4 us of chip-select to be 2.0 us; 1.6 likely "
                "dropped the setup and hold - check t_cs_us is added to the shift time",
        )

    def test_the_default_overhead_is_the_workshop_value(self):
        self.assertAlmostEqual(
            submission.spi_frame_us(16, 10e6), 2.0, delta=1e-12,
            msg="expected the default chip-select overhead of 0.4 us to give the same 2.0 us; "
                "1.6 likely defaulted t_cs to zero - check DEFAULT_CS_US",
        )

    def test_a_24_bit_frame_costs_2_4_us(self):
        self.assertAlmostEqual(
            submission.spi_frame_us(24, 12e6, 0.4), 2.4, delta=1e-12,
            msg="expected 2.0 us of clocks plus 0.4 us of overhead to be 2.4 us; 2.0 likely "
                "used the 2.0 us shift alone - check the overhead applies to every frame",
        )

    def test_zero_overhead_is_the_shift_time(self):
        for n_bits, f_sclk in ((16, 10e6), (24, 12e6), (12, 1e6)):
            self.assertAlmostEqual(
                submission.spi_frame_us(n_bits, f_sclk, 0.0),
                submission.spi_shift_us(n_bits, f_sclk), delta=1e-12,
                msg="expected zero chip-select overhead to reproduce the shift time exactly at "
                    "every bit count in this loop; a mismatch likely added a default overhead "
                    "anyway - check t_cs_us is used verbatim",
            )

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
        self.assertAlmostEqual(
            submission.uart_poll_us(320, 1e6), 320.0, delta=1e-9,
            msg="expected 320 bits at 1 Mbps to stall the CPU for 320 us; 40 likely treated "
                "the bits as 8N1 bytes - check the argument is already bits",
        )

    def test_the_skip_test_uart_poll(self):
        # 50 bytes of 8N1 is 500 bits, not 50: 500 us at 1 Mbps.
        self.assertAlmostEqual(
            submission.uart_poll_us(500, 1e6), 500.0, delta=1e-9,
            msg="expected 500 bits at 1 Mbps to cost 500 us; 62.5 likely divided the bits by "
                "eight - check every 8N1 bit stalls the loop",
        )

    def test_ten_bytes_at_115200(self):
        self.assertAlmostEqual(
            submission.uart_poll_us(80, 115200), 694.4444444444445, delta=1e-9,
            msg="expected 80 bits at 115200 baud to cost about 694.4 us; 86.8 likely divided "
                "the bits by 8, or 694.4 by using bytes - check bits / baud * 1e6",
        )

    def test_the_worked_poll_overflows_a_twenty_kilohertz_loop(self):
        self.assertAlmostEqual(
            submission.cpu_load_fraction(322.0, 50.0), 6.44, delta=1e-12,
            msg="expected 322 us of work in a 50 us loop to be 6.44 loops of load; 0.155 likely "
                "inverted the ratio - check busy time over loop period",
        )

    def test_dma_setup_is_one_percent_of_the_loop(self):
        self.assertAlmostEqual(
            submission.cpu_load_fraction(0.5, 50.0), 0.01, delta=1e-12,
            msg="expected 0.5 us of DMA setup in a 50 us loop to be 1 percent; 100 likely "
                "divided the loop by the setup - check the order of the arguments",
        )

    def test_half_the_tick_is_half_the_load(self):
        self.assertAlmostEqual(
            submission.cpu_load_fraction(500.0, 1000.0), 0.5, delta=1e-12,
            msg="expected 500 us of work in a 1000 us period to be half the CPU; 2.0 likely "
                "inverted the fraction - check t_busy_us / t_loop_us",
        )

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
        self.assertAlmostEqual(
            submission.ping_pong_window_us(16, 200000), 80.0, delta=1e-9,
            msg="expected 16 samples at 200 kHz to give an 80 us window; 160 likely used the "
                "32-sample total - check the half length is what the ISR has",
        )

    def test_a_slow_adc_gives_a_long_window(self):
        self.assertAlmostEqual(
            submission.ping_pong_window_us(4, 1000), 4000.0, delta=1e-9,
            msg="expected 4 samples at 1 kHz to give a 4000 us window; 4 likely returned "
                "milliseconds - check the result is in microseconds",
        )

    def test_the_skip_test_window(self):
        self.assertAlmostEqual(
            submission.ping_pong_window_us(32, 64000), 500.0, delta=1e-9,
            msg="expected 32 samples at 64 kHz to give a 500 us window; 1000 likely used the "
                "64-sample total - check the half-buffer length is passed",
        )

    def test_the_skip_test_ht_rate(self):
        # 64 kHz over a 32-sample half: 2000 Hz, one HT every 500 us.
        self.assertAlmostEqual(
            submission.ht_frequency_hz(64000, 32), 2000.0, delta=1e-12,
            msg="expected 64 kHz over a 32-sample half to fire HT at 2000 Hz; 1000 likely "
                "divided by the 64-sample total - check f_sample / n_half",
        )

    def test_the_exercise_ht_rate(self):
        self.assertAlmostEqual(
            submission.ht_frequency_hz(200000, 16), 12500.0, delta=1e-12,
            msg="expected 200 kHz over a 16-sample half to fire at 12500 Hz; 6250 likely "
                "divided by 32 - check only the half length divides the sample rate",
        )

    def test_the_ht_rate_times_the_window_is_one(self):
        # The HT period is exactly the window: read the half before the other one fills.
        window_s = submission.ping_pong_window_us(16, 200000) / 1e6
        self.assertAlmostEqual(
            submission.ht_frequency_hz(200000, 16) * window_s, 1.0, delta=1e-12,
            msg="expected one HT per window, so rate times window is exactly 1; 0.5 or 2 likely "
                "mixed the half length with the total - check both use n_half",
        )

    def test_the_half_transfer_reads_ping(self):
        self.assertEqual(
            submission.buffer_slice_for_position(3, 4), (0, 4),
            msg="expected the HT at write position 3 to release Ping [0, 4); the other half "
                "likely swapped the roles - check N-1 reads the half just filled",
        )

    def test_the_transfer_complete_reads_pong(self):
        self.assertEqual(
            submission.buffer_slice_for_position(7, 4), (4, 8),
            msg="expected the TC at write position 7 to release Pong [4, 8); (0, 4) likely "
                "returned the same half twice - check the roles swap at 2N-1",
        )

    def test_mid_half_is_not_safe_to_read(self):
        for write_pos in (0, 1, 2, 4, 5, 6):
            self.assertIsNone(
                submission.buffer_slice_for_position(write_pos, 4),
                msg="expected None at every mid-half write position in this loop, because that "
                    "half is still being filled; a slice here races the DMA engine - check only "
                    "N-1 and 2N-1 return a slice",
            )

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
        self.assertEqual(
            processed, [(k + 1) * 10 for k in range(16)],
            msg="expected all sixteen samples to reach the CPU exactly once and in order; a "
                "missing or repeated value likely means one half was read twice - check the "
                "readable half alternates",
        )
        self.assertEqual(
            interrupts, [(0, 4), (4, 8), (0, 4), (4, 8)],
            msg="expected the interrupts to alternate Ping and Pong four times; another pattern "
                "likely reads the half being written - check the HT and TC positions",
        )


if __name__ == "__main__":
    unittest.main()
