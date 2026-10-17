"""Behaviour tests for 04-embedded.T2.04d.

Each test names the mistake it catches:
  * a wire time that forgets the XRCE header (it looks fine until the link saturates);
  * 8 bits per byte on an 8N1 UART (a 25% optimistic budget - two start/stop bits per byte);
  * a utilisation that averages the stream frequencies instead of summing `f * t`;
  * a handle count that leaves slack, or one that counts the executor itself;
  * a spin WCET that includes only the I/O, or only the largest callback;
  * an offset computed as `t2 - t1` alone, which is half the round trip plus the true offset;
  * an RTOS utilisation that takes the mean of `C/T` instead of the sum.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class WireTests(unittest.TestCase):
    def test_the_uart_exercise(self):
        self.assertAlmostEqual(submission.wire_time_us(32, 14, 10, 921600.0), 499.1319, delta=1e-4)

    def test_the_can_worked_example(self):
        self.assertAlmostEqual(submission.wire_time_us(48, 16, 8, 5_000_000.0), 102.4, delta=1e-9)
        self.assertAlmostEqual(submission.wire_time_us(24, 16, 8, 5_000_000.0), 64.0, delta=1e-9)

    def test_the_header_is_part_of_the_frame(self):
        without = submission.wire_time_us(32, 0, 10, 921600.0)
        with_header = submission.wire_time_us(32, 14, 10, 921600.0)
        self.assertGreater(with_header, without)
        self.assertAlmostEqual(with_header / without, 46.0 / 32.0, delta=1e-12)

    def test_uart_and_can_differ_by_ten_over_eight(self):
        uart = submission.wire_time_us(40, 0, 10, 1_000_000.0)
        can = submission.wire_time_us(40, 0, 8, 1_000_000.0)
        self.assertAlmostEqual(uart / can, 10.0 / 8.0, delta=1e-12)

    def test_a_zero_rate_is_refused(self):
        with self.assertRaises(ValueError):
            submission.wire_time_us(10, 0, 10, 0.0)


class UtilisationTests(unittest.TestCase):
    def test_the_worked_can_budget(self):
        streams = [(500.0, 48, 16), (500.0, 24, 16)]
        self.assertAlmostEqual(submission.link_utilization(streams, 8, 5_000_000.0), 0.0832,
                               delta=1e-9)

    def test_a_saturated_link_goes_over_one(self):
        # 46 bytes at 921.6 kbaud is 499 us; at 3 kHz that is one and a half links' worth.
        self.assertGreater(submission.link_utilization([(3000.0, 32, 14)], 10, 921600.0), 1.0)
        self.assertLess(submission.link_utilization([(1000.0, 32, 14)], 10, 500_000.0), 1.0)

    def test_frequencies_add(self):
        one = submission.link_utilization([(500.0, 40, 8)], 8, 4_000_000.0)
        two = submission.link_utilization([(500.0, 40, 8), (500.0, 40, 8)], 8, 4_000_000.0)
        self.assertAlmostEqual(two, 2.0 * one, delta=1e-12)

    def test_an_idle_link_is_zero(self):
        self.assertEqual(submission.link_utilization([], 10, 115200.0), 0.0)


class ExecutorTests(unittest.TestCase):
    def test_the_handle_count(self):
        self.assertEqual(submission.handle_total(1, 2, 1, 0), 4)
        self.assertEqual(submission.handle_total(0, 0, 0, 0), 0)
        self.assertEqual(submission.handle_total(2, 3, 1, 2), 8)

    def test_the_spin_wcet(self):
        self.assertAlmostEqual(submission.spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0]), 185.0,
                               delta=1e-12)
        self.assertAlmostEqual(submission.spin_wcet_us(35.0, []), 35.0, delta=1e-12)

    def test_every_callback_is_counted(self):
        one = submission.spin_wcet_us(35.0, [45.0])
        four = submission.spin_wcet_us(35.0, [45.0] * 4)
        self.assertAlmostEqual(four - one, 3.0 * 45.0, delta=1e-12)


class ClockTests(unittest.TestCase):
    def test_the_worked_sync_session(self):
        rtt = submission.ntp_rtt_us(1000.0, 500120.0, 500150.0, 1270.0)
        offset = submission.ntp_offset_us(1000.0, 500120.0, 500150.0, 1270.0)
        self.assertAlmostEqual(rtt, 240.0, delta=1e-9)
        self.assertAlmostEqual(offset, 499000.0, delta=1e-9)

    def test_the_exercise_exchange(self):
        offset = submission.ntp_offset_us(200.0, 10300.0, 10340.0, 440.0)
        rtt = submission.ntp_rtt_us(200.0, 10300.0, 10340.0, 440.0)
        self.assertAlmostEqual(offset, 10000.0, delta=1e-9)
        self.assertAlmostEqual(rtt, 200.0, delta=1e-9)

    def test_a_symmetric_link_recovers_the_true_offset(self):
        offset = 1234.5
        delay = 60.0
        process = 15.0
        t1 = 10.0
        t2 = t1 + delay + offset
        t3 = t2 + process
        t4 = t3 + delay - offset
        self.assertAlmostEqual(submission.ntp_offset_us(t1, t2, t3, t4), offset, delta=1e-9)
        self.assertAlmostEqual(submission.ntp_rtt_us(t1, t2, t3, t4), 2.0 * delay, delta=1e-9)

    def test_asymmetry_biases_the_offset_by_half_the_difference(self):
        true_offset = 500.0
        forward, reverse = 100.0, 80.0
        t1 = 0.0
        t2 = t1 + forward + true_offset
        t3 = t2 + 10.0
        t4 = t3 + reverse - true_offset
        measured = submission.ntp_offset_us(t1, t2, t3, t4)
        self.assertAlmostEqual(measured, true_offset + (forward - reverse) / 2.0, delta=1e-9)


class RtosTests(unittest.TestCase):
    def test_the_gate_test_utilisation(self):
        tasks = [(100.0, 500.0), (300.0, 2000.0), (1000.0, 10000.0)]
        self.assertAlmostEqual(submission.rtos_utilization(tasks), 0.45, delta=1e-12)

    def test_it_is_a_sum_not_a_mean(self):
        self.assertAlmostEqual(submission.rtos_utilization([(100.0, 500.0)] * 3), 0.6, delta=1e-12)

    def test_an_overloaded_set_exceeds_one(self):
        self.assertGreater(submission.rtos_utilization([(600.0, 1000.0), (600.0, 1000.0)]), 1.0)

    def test_a_zero_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rtos_utilization([(10.0, 0.0)])


if __name__ == "__main__":
    unittest.main()
