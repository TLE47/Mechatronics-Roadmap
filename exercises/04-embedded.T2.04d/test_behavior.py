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
        self.assertAlmostEqual(
            submission.wire_time_us(32, 14, 10, 921600.0), 499.1319, delta=1e-4,
            msg="expected 46 bytes at 10 bits each over 921.6 kbaud to take 499.13 us; 345 "
                "likely used 8 bits per byte - check the 8N1 framing",
        )

    def test_the_can_worked_example(self):
        self.assertAlmostEqual(
            submission.wire_time_us(48, 16, 8, 5_000_000.0), 102.4, delta=1e-9,
            msg="expected 64 bytes at 8 bits each over 5 Mbit/s to take 102.4 us; 128 likely "
                "charged the UART's 10 bits - check CAN uses 8",
        )
        self.assertAlmostEqual(
            submission.wire_time_us(24, 16, 8, 5_000_000.0), 64.0, delta=1e-9,
            msg="expected 40 bytes at 8 bits over 5 Mbit/s to take 64.0 us; 40 likely forgot to "
                "add the XRCE header - check the header grows the frame",
        )

    def test_the_header_is_part_of_the_frame(self):
        without = submission.wire_time_us(32, 0, 10, 921600.0)
        with_header = submission.wire_time_us(32, 14, 10, 921600.0)
        self.assertGreater(
            with_header, without,
            msg="expected the XRCE header to make the frame slower; equality likely dropped the "
                "header argument - check xrce_bytes is added before the bit count",
        )
        self.assertAlmostEqual(
            with_header / without, 46.0 / 32.0, delta=1e-12,
            msg="expected the header to scale the wire time by 46/32; another ratio likely "
                "added a fixed delay instead of 14 more bytes - check both use the same rate",
        )

    def test_uart_and_can_differ_by_ten_over_eight(self):
        uart = submission.wire_time_us(40, 0, 10, 1_000_000.0)
        can = submission.wire_time_us(40, 0, 8, 1_000_000.0)
        self.assertAlmostEqual(
            uart / can, 10.0 / 8.0, delta=1e-12,
            msg="expected the UART's 8N1 framing to cost 10/8 of CAN's 8 bits; 1.0 likely used "
                "one bits-per-byte constant for both - check the argument is applied",
        )

    def test_a_zero_rate_is_refused(self):
        with self.assertRaises(ValueError):
            submission.wire_time_us(10, 0, 10, 0.0)


class UtilisationTests(unittest.TestCase):
    def test_the_worked_can_budget(self):
        streams = [(500.0, 48, 16), (500.0, 24, 16)]
        self.assertAlmostEqual(
            submission.link_utilization(streams, 8, 5_000_000.0), 0.0832,
            delta=1e-9,
            msg="expected the two 500 Hz CAN streams to use 8.32 percent of the link; 4.16 "
                "likely averaged them instead of summing - check every stream adds",
        )

    def test_a_saturated_link_goes_over_one(self):
        # 46 bytes at 921.6 kbaud is 499 us; at 3 kHz that is one and a half links' worth.
        self.assertGreater(
            submission.link_utilization([(3000.0, 32, 14)], 10, 921600.0), 1.0,
            msg="expected 3 kHz of 499 us frames to overrun the link; a value below 1.0 likely "
                "ignored the frame count - check frequency times wire time",
        )
        self.assertLess(
            submission.link_utilization([(1000.0, 32, 14)], 10, 500_000.0), 1.0,
            msg="expected 1 kHz of the same frames on a 500 kbaud link to fit; a value above "
                "1.0 likely kept the old rate - check 920 kbit/s of demand",
        )

    def test_frequencies_add(self):
        one = submission.link_utilization([(500.0, 40, 8)], 8, 4_000_000.0)
        two = submission.link_utilization([(500.0, 40, 8), (500.0, 40, 8)], 8, 4_000_000.0)
        self.assertAlmostEqual(
            two, 2.0 * one, delta=1e-12,
            msg="expected two identical streams to double the utilisation; an unchanged value "
                "likely averaged the list - check the load is a sum of f * t",
        )

    def test_an_idle_link_is_zero(self):
        self.assertEqual(
            submission.link_utilization([], 10, 115200.0), 0.0,
            msg="expected no streams to mean an idle link; a nonzero value likely counted a "
                "fixed overhead - check the total starts at zero",
        )


class ExecutorTests(unittest.TestCase):
    def test_the_handle_count(self):
        self.assertEqual(
            submission.handle_total(1, 2, 1, 0), 4,
            msg="expected 1 timer, 2 subscriptions, 1 service and 0 clients to need 4 handles; "
                "5 likely added one for the executor itself - check only real entities count",
        )
        self.assertEqual(
            submission.handle_total(0, 0, 0, 0), 0,
            msg="expected an empty executor to need no handles; a nonzero value likely reserved "
                "slack - check the count is exact",
        )
        self.assertEqual(
            submission.handle_total(2, 3, 1, 2), 8,
            msg="expected 2 + 3 + 1 + 2 entities to need 8 handles; 7 likely dropped the "
                "services - check all four categories are summed",
        )

    def test_the_spin_wcet(self):
        self.assertAlmostEqual(
            submission.spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0]), 185.0,
            delta=1e-12,
            msg="expected 35 us of I/O plus every callback (150 us) to be 185 us; 85 or 35 "
                "likely kept only the largest callback or only the I/O - check the sum",
        )
        self.assertAlmostEqual(
            submission.spin_wcet_us(35.0, []), 35.0, delta=1e-12,
            msg="expected no callbacks to leave just the 35 us of transport I/O; 0.0 likely "
                "summed only the callbacks - check the I/O is the base term",
        )

    def test_every_callback_is_counted(self):
        one = submission.spin_wcet_us(35.0, [45.0])
        four = submission.spin_wcet_us(35.0, [45.0] * 4)
        self.assertAlmostEqual(
            four - one, 3.0 * 45.0, delta=1e-12,
            msg="expected three more callbacks to add 135 us; a smaller step likely took the "
                "maximum instead of the sum - check every callback contributes",
        )


class ClockTests(unittest.TestCase):
    def test_the_worked_sync_session(self):
        rtt = submission.ntp_rtt_us(1000.0, 500120.0, 500150.0, 1270.0)
        offset = submission.ntp_offset_us(1000.0, 500120.0, 500150.0, 1270.0)
        self.assertAlmostEqual(
            rtt, 240.0, delta=1e-9,
            msg="expected a 240 us round trip from the four stamps; 270 likely forgot to "
                "subtract the host's 30 us of processing - check t3 - t2",
        )
        self.assertAlmostEqual(
            offset, 499000.0, delta=1e-9,
            msg="expected a 499000 us offset from the NTP midpoint; 499120 likely used only "
                "t2 - t1, which carries the forward delay - check both halves",
        )

    def test_the_exercise_exchange(self):
        offset = submission.ntp_offset_us(200.0, 10300.0, 10340.0, 440.0)
        rtt = submission.ntp_rtt_us(200.0, 10300.0, 10340.0, 440.0)
        self.assertAlmostEqual(
            offset, 10000.0, delta=1e-9,
            msg="expected the midpoint estimate to recover the 10000 us offset; 10100 likely "
                "used one direction only - check the two differences are averaged",
        )
        self.assertAlmostEqual(
            rtt, 200.0, delta=1e-9,
            msg="expected a 200 us round trip from the stamps; 240 likely included the host's "
                "40 us of processing - check the processing time is removed",
        )

    def test_a_symmetric_link_recovers_the_true_offset(self):
        offset = 1234.5
        delay = 60.0
        process = 15.0
        t1 = 10.0
        t2 = t1 + delay + offset
        t3 = t2 + process
        t4 = t3 + delay - offset
        self.assertAlmostEqual(
            submission.ntp_offset_us(t1, t2, t3, t4), offset, delta=1e-9,
            msg="expected a symmetric 60 us path to recover the 1234.5 us offset exactly; a "
                "value near 1294.5 likely counted one delay - check the midpoint removes both",
        )
        self.assertAlmostEqual(
            submission.ntp_rtt_us(t1, t2, t3, t4), 2.0 * delay, delta=1e-9,
            msg="expected the round trip to be both 60 us delays, 120 us; 60 or 135 likely "
                "measured one direction or kept the processing time - check the four stamps",
        )

    def test_asymmetry_biases_the_offset_by_half_the_difference(self):
        true_offset = 500.0
        forward, reverse = 100.0, 80.0
        t1 = 0.0
        t2 = t1 + forward + true_offset
        t3 = t2 + 10.0
        t4 = t3 + reverse - true_offset
        measured = submission.ntp_offset_us(t1, t2, t3, t4)
        self.assertAlmostEqual(
            measured, true_offset + (forward - reverse) / 2.0, delta=1e-9,
            msg="expected a 20 us asymmetry to bias the offset by +10 to 510 us; 500 likely "
                "assumed symmetry, 520 used the whole difference - check the half",
        )


class RtosTests(unittest.TestCase):
    def test_the_gate_test_utilisation(self):
        tasks = [(100.0, 500.0), (300.0, 2000.0), (1000.0, 10000.0)]
        self.assertAlmostEqual(
            submission.rtos_utilization(tasks), 0.45, delta=1e-12,
            msg="expected 0.2 + 0.15 + 0.1 to be 0.45 of the CPU; 0.15 likely averaged the "
                "three ratios - check the sum of C/T",
        )

    def test_it_is_a_sum_not_a_mean(self):
        self.assertAlmostEqual(
            submission.rtos_utilization([(100.0, 500.0)] * 3), 0.6, delta=1e-12,
            msg="expected three tasks at 0.2 each to need 0.6 of the CPU; 0.2 likely returned "
                "the mean, which would pass an impossible schedule - check the sum",
        )

    def test_an_overloaded_set_exceeds_one(self):
        self.assertGreater(
            submission.rtos_utilization([(600.0, 1000.0), (600.0, 1000.0)]), 1.0,
            msg="expected two 60 percent tasks to overload the CPU at 1.2; a value at or below "
                "1.0 likely capped or averaged it - check the bound is not clamped",
        )

    def test_a_zero_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rtos_utilization([(10.0, 0.0)])


if __name__ == "__main__":
    unittest.main()
