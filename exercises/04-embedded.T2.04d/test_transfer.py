"""Transfer tests for 04-embedded.T2.04d - the plant's own telemetry link.

Three claims, measured against the shared plant:
  1. the plant's 20-byte frame at 1 kHz saturates a 115.2 kbaud link and does not saturate a
     500 kbaud one - and the submission's utilisation crosses 1.0 exactly at the baud rate where
     the plant's own UART model stops dropping frames;
  2. the clock offset recovered over that link is exact when the two directions are symmetric and
     biased by half the asymmetry when they are not, at the link's real wire-time scale;
  3. the 1 kHz spin budget the module audits fits inside the plant's control period.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class TelemetryLinkTests(unittest.TestCase):
    def streams(self, frequency):
        return [(frequency, plant.FRAME_BYTES, 0)]

    def test_the_capstone_link_saturates(self):
        slow = submission.link_utilization(self.streams(1.0 / plant.DT), 10, plant.BAUD_OVERFLOWS)
        fast = submission.link_utilization(self.streams(1.0 / plant.DT), 10, plant.BAUD_FITS)
        self.assertGreater(
            slow, 1.0,
            msg="expected 20-byte frames at 1 kHz to overrun 115.2 kbaud; a value under 1.0 "
                "likely used 8 bits per byte - check the 8N1 framing",
        )
        self.assertLess(
            fast, 1.0,
            msg="expected the same stream to fit the plant's 500 kbaud link; a value above 1.0 "
                "likely kept the slow baud rate - check plant.BAUD_FITS",
        )
        self.assertGreater(
            plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                   plant.BAUD_OVERFLOWS), 0,
            msg="expected the plant's own UART model to drop frames on the slow link; zero "
                "drops likely means the simulation ran at the fast rate - check BAUD_OVERFLOWS",
        )
        self.assertEqual(
            plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                   plant.BAUD_FITS), 0,
            msg="expected no drops on the plant's fast link; a nonzero count likely used 10 "
                "bits and still queued frames - check the budget in the plant's model",
        )

    def test_the_boundary_is_the_same_in_both_models(self):
        # 20 bytes, 10 bits each, 1 kHz: unity utilisation at exactly 200 kbaud.
        critical = 10.0 * plant.FRAME_BYTES / plant.DT
        below = 0.98 * critical
        above = 1.02 * critical
        self.assertGreater(
            submission.link_utilization(self.streams(1.0 / plant.DT), 10, below), 1.0,
            msg="expected 2 percent below the critical baud rate to overrun the link; a value "
                "under 1.0 likely used the wrong frame size - check 200 bytes of bits per ms",
        )
        self.assertLess(
            submission.link_utilization(self.streams(1.0 / plant.DT), 10, above), 1.0,
            msg="expected 2 percent above the critical rate to fit; a value above 1.0 likely "
                "used one bit per byte too many - check the 10-bit 8N1 framing",
        )
        self.assertGreater(
            plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                   int(below)), 0,
            msg="expected the plant's model to drop frames just under the critical rate; zero "
                "drops likely rounded the baud up - check the same boundary as the submission",
        )
        self.assertEqual(
            plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                   int(above)), 0,
            msg="expected no drops just above the critical rate; a nonzero count likely "
                "truncated the baud low - check both models cross at 200 kbaud",
        )


class ClockOverTheLinkTests(unittest.TestCase):
    def test_a_symmetric_link_at_the_real_wire_time(self):
        delay = submission.wire_time_us(plant.FRAME_BYTES, 0, 10, plant.BAUD_FITS)
        self.assertAlmostEqual(
            delay, 400.0, delta=1e-9,
            msg="expected one 20-byte frame at 10 bits over 500 kbaud to take 400 us; 320 "
                "likely used 8 bits per byte - check the 8N1 framing",
        )
        offset = 250_000.0
        t1 = 10_000.0
        t2 = t1 + delay + offset
        t3 = t2 + 40.0
        t4 = t3 + delay - offset
        self.assertAlmostEqual(
            submission.ntp_offset_us(t1, t2, t3, t4), offset, delta=1e-6,
            msg="expected the symmetric 400 us link to recover the 250 ms offset exactly; "
                "250400 likely counted one delay - check the NTP midpoint",
        )
        self.assertAlmostEqual(
            submission.ntp_rtt_us(t1, t2, t3, t4), 2.0 * delay, delta=1e-6,
            msg="expected the round trip to be both 400 us directions, 800 us; 400 or 840 "
                "likely measured one leg or kept the processing - check the four stamps",
        )

    def test_a_congested_reverse_path_biases_the_estimate(self):
        delay = submission.wire_time_us(plant.FRAME_BYTES, 0, 10, plant.BAUD_OVERFLOWS)
        self.assertGreater(
            delay, plant.DT * 1e6,
            msg="expected the slow link's frame to take longer than one 1000 us control tick; "
                "a smaller value likely used the fast baud rate - check BAUD_OVERFLOWS",
        )
        true_offset = 1000.0
        t1 = 0.0
        t2 = t1 + delay + true_offset
        t3 = t2 + 40.0
        t4 = t3 + 2.0 * delay - true_offset
        measured = submission.ntp_offset_us(t1, t2, t3, t4)
        self.assertAlmostEqual(
            measured, true_offset - delay / 2.0, delta=1e-6,
            msg="expected a reverse path one delay longer to bias the estimate down by half a "
                "delay; 1000 likely assumed symmetry - check the asymmetry term",
        )
        self.assertGreater(
            abs(measured - true_offset), 100.0,
            msg="expected the asymmetry bias to exceed 100 us on this congested link, so it "
                "cannot be ignored; a smaller error likely swapped the delays",
        )


class SpinBudgetTests(unittest.TestCase):
    def test_the_audited_node_fits_the_control_tick(self):
        period_us = plant.DT * 1e6
        wcet = submission.spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0])
        self.assertLess(
            wcet, period_us,
            msg="expected the audited 185 us spin to fit inside one 1000 us tick; a larger "
                "figure likely multiplied the callbacks - check the WCET is a sum",
        )
        self.assertAlmostEqual(
            period_us, 1000.0, delta=1e-9,
            msg="expected the plant's control period to be 1000 us; another value likely read "
                "DT in seconds - check DT * 1e6",
        )

    def test_a_heavy_node_misses_the_same_tick(self):
        period_us = plant.DT * 1e6
        heavy = submission.spin_wcet_us(35.0, [300.0] * 4)
        self.assertGreater(
            heavy, period_us,
            msg="expected four 300 us callbacks plus I/O to overrun the 1000 us tick; a smaller "
                "figure likely kept only the largest callback - check every one is counted",
        )


if __name__ == "__main__":
    unittest.main()
