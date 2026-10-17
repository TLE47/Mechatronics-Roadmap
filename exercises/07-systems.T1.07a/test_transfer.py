"""Transfer tests for 07-systems.T1.07a - the plant's own trajectory, tick and interlock.

Three claims, measured on the shared arm:
  1. the lock-in recovers the figure-8's published amplitudes `AX` and `AY` from samples of the
     plant's own target function, and rejects the frequency next door;
  2. a 1 ms Read+Execute+Write budget is the plant's 1 kHz scan, no more and no less;
  3. a broken NC contact at the plant's own tick cadence drops the power enable on the next scan,
     latches, and refuses to restart without a reset.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

PERIOD_S = 1.0 / plant.FREQ_HZ


class LockInTests(unittest.TestCase):
    def test_the_figure_eight_amplitudes_come_back_out(self):
        dt = plant.DT
        steps = int(round(4.0 * (1.0 / dt)))  # four seconds at the plant's tick
        xs = [plant.figure8_target(k * dt)[0] for k in range(steps)]
        ys = [plant.figure8_target(k * dt)[1] for k in range(steps)]
        self.assertAlmostEqual(submission.sine_amplitude(xs, plant.FREQ_HZ, dt), plant.AX,
                               delta=1e-6)
        self.assertAlmostEqual(submission.sine_amplitude(ys, 2.0 * plant.FREQ_HZ, dt), plant.AY,
                               delta=1e-6)

    def test_the_neighbouring_frequency_is_rejected(self):
        dt = plant.DT
        steps = int(round(4.0 / dt))
        xs = [plant.figure8_target(k * dt)[0] for k in range(steps)]
        neighbour = submission.sine_amplitude(xs, 1.5 * plant.FREQ_HZ, dt)
        self.assertLess(neighbour, 0.2 * plant.AX)

    def test_a_quarter_period_of_the_figure_eight_is_a_quarter_turn(self):
        self.assertAlmostEqual(submission.phase_lag_deg(plant.FREQ_HZ, PERIOD_S / 4.0), -90.0,
                               delta=1e-9)


class ScanTests(unittest.TestCase):
    def test_a_one_millisecond_budget_is_the_plants_tick(self):
        self.assertAlmostEqual(submission.scan_frequency_hz(0.4, 0.4, 0.2), 1.0 / plant.DT,
                               delta=1e-9)

    def test_the_plant_cannot_scan_faster_than_it_reads(self):
        # Even with the logic free, a 0.4 ms read plus 0.2 ms write caps the scan below 1.7 kHz.
        self.assertLess(submission.scan_frequency_hz(0.4, 0.0, 0.2), 1700.0)


class PlcOverThePlantClockTests(unittest.TestCase):
    def test_a_wire_break_drops_power_on_the_next_scan(self):
        state, power = submission.plc_scan_step("IDLE", 1, 1, 1, True, False)
        self.assertEqual((state, power), ("RUNNING", True))
        broke_at = 100
        for tick in range(200):
            healthy = tick < broke_at
            state, power = submission.plc_scan_step(state, healthy, 1, 1, False, False)
            if tick >= broke_at:
                self.assertFalse(power, "tick %d still powered" % tick)
                self.assertEqual(state, "ESTOP_LATCHED")

    def test_the_interlock_needs_a_reset_and_a_released_start(self):
        state = "ESTOP_LATCHED"
        state, power = submission.plc_scan_step(state, 1, 1, 1, True, True)
        self.assertEqual((state, power), ("ESTOP_LATCHED", False))
        state, power = submission.plc_scan_step(state, 1, 1, 1, False, True)
        self.assertEqual((state, power), ("IDLE", False))
        state, power = submission.plc_scan_step(state, 1, 1, 1, True, False)
        self.assertEqual((state, power), ("RUNNING", True))


if __name__ == "__main__":
    unittest.main()
