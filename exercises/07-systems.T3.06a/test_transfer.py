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
        self.assertEqual(
            rate, 30000,
            msg="expected 30000 B/s for two doubles at 1 kHz including the header; 20000 likely "
                "dropped the 14-byte header - check 30 bytes per 1 ms frame",
        )
        raw = FRAME_BYTES * TICK_HZ
        self.assertEqual(
            raw, 20000,
            msg="expected the plant's raw 20-byte frame at 1 kHz to be 20000 B/s; another value "
                "likely used a different frame width - check plant.FRAME_BYTES",
        )
        self.assertGreater(
            rate, raw,
            msg="expected the OPC UA frame to cost more than the raw payload, since the 14-byte "
                "header is real traffic; equality likely forgot the header",
        )

    def test_it_fits_the_plants_fast_link_and_not_the_slow_one(self):
        # 10 bits per byte on the wire (8N1).
        rate = submission.opc_ua_pubsub_rate_bps(2, TICK_HZ)
        self.assertLess(
            rate * 10, plant.BAUD_FITS,
            msg="expected the 300000 baud line to carry this stream; a higher figure likely "
                "counted 8 bits per byte instead of 10 - check the 8N1 framing",
        )
        self.assertGreater(
            rate * 10, plant.BAUD_OVERFLOWS,
            msg="expected the slow link the plant already proves drops frames to be too small; "
                "a lower figure likely compared bytes against baud - check the x10 conversion",
        )


class StoOverThePlantClockTests(unittest.TestCase):
    def test_torque_is_removed_on_the_tick_channel_a_opens(self):
        opened = 250
        for tick in range(240, 275):
            elapsed = 0.0 if tick < opened else (tick - opened) * TICK_MS
            state = submission.sto_evaluate(tick >= opened, False, elapsed)
            if tick < opened:
                self.assertFalse(
                    state["torque_removed"],
                    msg="expected torque still available on every tick before Channel A opens; "
                        "True likely read the future safe flag - check the tick's channel state",
                )
            else:
                self.assertTrue(
                    state["torque_removed"],
                    msg="expected torque gone on the tick Channel A opens and every tick after; "
                        "False likely required both channels or a filtered fault - check "
                        "torque_removed",
                )

    def test_twelve_milliseconds_of_skew_does_not_latch(self):
        opened = 250
        for tick in range(opened, opened + 13):
            elapsed = (tick - opened) * TICK_MS
            state = submission.sto_evaluate(True, False, elapsed)
            self.assertFalse(
                state["discrepancy_fault"],
                msg="expected 12 ms of skew at every tick in this loop to stay inside the 20 ms "
                    "filter; True likely latched on the first disagreement - check "
                    "t_disc_max_ms",
            )

    def test_a_stuck_channel_latches_when_the_skew_crosses_the_filter(self):
        opened = 250
        first_fault = None
        for tick in range(opened, opened + 40):
            elapsed = (tick - opened) * TICK_MS
            if submission.sto_evaluate(True, False, elapsed)["discrepancy_fault"]:
                first_fault = elapsed
                break
        self.assertIsNotNone(
            first_fault,
            msg="expected a stuck Channel B to latch within 40 ticks; None likely means the "
                "filter was never consulted - check discrepancy_ms > t_disc_max_ms",
        )
        self.assertGreater(
            first_fault, 20.0,
            msg="expected the latch no earlier than the 20 ms filter boundary; a smaller value "
                "likely latched on any disagreement - check the comparison is strict",
        )
        self.assertLessEqual(
            first_fault, 20.0 + TICK_MS,
            msg="expected the latch within one plant tick after 20 ms, at 21 ms; a later value "
                "likely checked the filter only every few ticks - check the 1 kHz loop",
        )

    def test_the_timing_worst_case_is_one_tick_of_filter_latency(self):
        # The plant's 1 kHz loop cannot notice a discrepancy sooner than one tick after the window.
        self.assertAlmostEqual(
            TICK_MS, 1.0, delta=1e-12,
            msg="expected one plant tick to be exactly 1 ms, the finest timing the loop can "
                "resolve; another value likely read DT in seconds - check plant.DT * 1000",
        )


class ResetAfterLatchTests(unittest.TestCase):
    def test_a_latched_fault_survives_the_release_and_blocks_restart(self):
        fault = submission.sto_evaluate(True, False, 150.0)
        self.assertTrue(
            fault["discrepancy_fault"],
            msg="expected a 150 ms discrepancy to latch as a fault; False likely compared the "
                "elapsed time against the wrong window - check t_disc_max_ms is 20 ms",
        )
        self.assertFalse(
            submission.reset_interlock(False, False, fault["discrepancy_fault"], True),
            msg="expected the latched fault to block restart even after both channels release "
                "and the press comes; True likely cleared the latch on release",
        )

    def test_a_cleared_fault_needs_a_press_not_a_clock(self):
        self.assertFalse(
            submission.reset_interlock(False, False, False, False),
            msg="expected a clear fault with no press to stay stopped; True likely restarted "
                "on the cleared channel state - check a deliberate press is required",
        )
        self.assertTrue(
            submission.reset_interlock(False, False, False, True),
            msg="expected a clear fault plus a press to allow restart; False likely required "
                "both channels safe as well - check the interlock's conditions",
        )


if __name__ == "__main__":
    unittest.main()
