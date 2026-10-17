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
        self.assertGreater(slow, 1.0, "20 bytes per millisecond cannot fit in 115.2 kbaud")
        self.assertLess(fast, 1.0)
        self.assertGreater(plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                                  plant.BAUD_OVERFLOWS), 0)
        self.assertEqual(plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                                plant.BAUD_FITS), 0)

    def test_the_boundary_is_the_same_in_both_models(self):
        # 20 bytes, 10 bits each, 1 kHz: unity utilisation at exactly 200 kbaud.
        critical = 10.0 * plant.FRAME_BYTES / plant.DT
        below = 0.98 * critical
        above = 1.02 * critical
        self.assertGreater(submission.link_utilization(self.streams(1.0 / plant.DT), 10, below), 1.0)
        self.assertLess(submission.link_utilization(self.streams(1.0 / plant.DT), 10, above), 1.0)
        self.assertGreater(plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                                  int(below)), 0)
        self.assertEqual(plant.simulate_uart_tx(plant.TICKS, plant.FRAME_BYTES, plant.DT,
                                                int(above)), 0)


class ClockOverTheLinkTests(unittest.TestCase):
    def test_a_symmetric_link_at_the_real_wire_time(self):
        delay = submission.wire_time_us(plant.FRAME_BYTES, 0, 10, plant.BAUD_FITS)
        self.assertAlmostEqual(delay, 400.0, delta=1e-9)
        offset = 250_000.0
        t1 = 10_000.0
        t2 = t1 + delay + offset
        t3 = t2 + 40.0
        t4 = t3 + delay - offset
        self.assertAlmostEqual(submission.ntp_offset_us(t1, t2, t3, t4), offset, delta=1e-6)
        self.assertAlmostEqual(submission.ntp_rtt_us(t1, t2, t3, t4), 2.0 * delay, delta=1e-6)

    def test_a_congested_reverse_path_biases_the_estimate(self):
        delay = submission.wire_time_us(plant.FRAME_BYTES, 0, 10, plant.BAUD_OVERFLOWS)
        self.assertGreater(delay, plant.DT * 1e6, "the slow link takes longer than one control tick")
        true_offset = 1000.0
        t1 = 0.0
        t2 = t1 + delay + true_offset
        t3 = t2 + 40.0
        t4 = t3 + 2.0 * delay - true_offset
        measured = submission.ntp_offset_us(t1, t2, t3, t4)
        self.assertAlmostEqual(measured, true_offset - delay / 2.0, delta=1e-6)
        self.assertGreater(abs(measured - true_offset), 100.0, "and the bias is not negligible")


class SpinBudgetTests(unittest.TestCase):
    def test_the_audited_node_fits_the_control_tick(self):
        period_us = plant.DT * 1e6
        wcet = submission.spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0])
        self.assertLess(wcet, period_us)
        self.assertAlmostEqual(period_us, 1000.0, delta=1e-9)

    def test_a_heavy_node_misses_the_same_tick(self):
        period_us = plant.DT * 1e6
        heavy = submission.spin_wcet_us(35.0, [300.0] * 4)
        self.assertGreater(heavy, period_us)


if __name__ == "__main__":
    unittest.main()
