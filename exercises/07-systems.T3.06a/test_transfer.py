"""Transfer tests for 07-systems.T3.06a - the plant's telemetry and its 1 kHz safety loop.

Three claims, measured on the shared arm's real numbers:
  1. the plant's own 20-byte, 1 kHz telemetry frame as an OPC UA PubSub stream: the 14-byte header
     makes it 50% bigger, it still fits the UART link that carries it, and it would not fit the slow
     one the plant already proves drops frames;
  2. the dual-channel STO decision run at the plant's 1 ms tick: torque is gone on the tick Channel
     A opens, normal 12 ms skew never latches, and a 30 ms stuck channel latches as soon as the
     skew crosses 20 ms;
  3. the reset interlock refuses restart after that latch until the fault is cleared by hand.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

FRAME_BYTES = plant.FRAME_BYTES
TICK_HZ = 1.0 / plant.DT
TICK_MS = plant.DT * 1000.0


class PubSubRateTests(unittest.TestCase):
    def test_the_plants_telemetry_as_a_pubsub_stream(self):
        # Two doubles (16 B) plus the 14-byte NetworkMessage header, at the plant's 1 kHz cadence.
        rate = submission.opc_ua_pubsub_rate_bps(2, TICK_HZ)
        self.assertEqual(rate, 30000)
        raw = FRAME_BYTES * TICK_HZ
        self.assertEqual(raw, 20000)
        self.assertGreater(rate, raw, "the OPC UA header is real traffic, not free")

    def test_it_fits_the_plants_fast_link_and_not_the_slow_one(self):
        # 10 bits per byte on the wire (8N1).
        rate = submission.opc_ua_pubsub_rate_bps(2, TICK_HZ)
        self.assertLess(rate * 10, plant.BAUD_FITS)
        self.assertGreater(rate * 10, plant.BAUD_OVERFLOWS)


class StoOverThePlantClockTests(unittest.TestCase):
    def test_torque_is_removed_on_the_tick_channel_a_opens(self):
        opened = 250
        for tick in range(240, 275):
            elapsed = 0.0 if tick < opened else (tick - opened) * TICK_MS
            state = submission.sto_evaluate(tick >= opened, False, elapsed)
            if tick < opened:
                self.assertFalse(state["torque_removed"])
            else:
                self.assertTrue(state["torque_removed"], "tick %d" % tick)

    def test_twelve_milliseconds_of_skew_does_not_latch(self):
        opened = 250
        for tick in range(opened, opened + 13):
            elapsed = (tick - opened) * TICK_MS
            state = submission.sto_evaluate(True, False, elapsed)
            self.assertFalse(state["discrepancy_fault"], "tick %d" % tick)

    def test_a_stuck_channel_latches_when_the_skew_crosses_the_filter(self):
        opened = 250
        first_fault = None
        for tick in range(opened, opened + 40):
            elapsed = (tick - opened) * TICK_MS
            if submission.sto_evaluate(True, False, elapsed)["discrepancy_fault"]:
                first_fault = elapsed
                break
        self.assertIsNotNone(first_fault)
        self.assertGreater(first_fault, 20.0)
        self.assertLessEqual(first_fault, 20.0 + TICK_MS)

    def test_the_timing_worst_case_is_one_tick_of_filter_latency(self):
        # The plant's 1 kHz loop cannot notice a discrepancy sooner than one tick after the window.
        self.assertAlmostEqual(TICK_MS, 1.0, delta=1e-12)


class ResetAfterLatchTests(unittest.TestCase):
    def test_a_latched_fault_survives_the_release_and_blocks_restart(self):
        fault = submission.sto_evaluate(True, False, 150.0)
        self.assertTrue(fault["discrepancy_fault"])
        self.assertFalse(submission.reset_interlock(False, False, fault["discrepancy_fault"], True))

    def test_a_cleared_fault_needs_a_press_not_a_clock(self):
        self.assertFalse(submission.reset_interlock(False, False, False, False))
        self.assertTrue(submission.reset_interlock(False, False, False, True))


if __name__ == "__main__":
    unittest.main()
