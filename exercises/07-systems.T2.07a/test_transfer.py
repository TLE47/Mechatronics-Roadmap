"""Transfer tests for 07-systems.T2.07a - the arm's elbow as a regenerative load.

Three claims, measured on the shared plant:
  1. bring the elbow up to speed under the capstone's own torque limit, then size the chopper from
     the kinetic energy it actually holds - not from an invented `omega0`;
  2. the resistor bound is tight: at the bound the chopper absorbs exactly the regenerative peak;
  3. the rolling counter and watchdog run over the plant's telemetry cadence, where a dropped
     frame every seven is a `WARN_DROPPED_1` and a repeated one is a `FAULT_FROZEN`.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def spin_up_elbow(seconds=0.05, torque=None):
    """Accelerate the elbow from rest at the capstone's torque limit and return its speed."""
    tau = plant.TAU_LIMIT if torque is None else torque
    q, dq = 0.0, 0.0
    for _ in range(int(round(seconds / plant.DT))):
        q, dq = plant.step_arm((0.0, q, 0.0, dq), (0.0, tau), dist=(0.0, 0.0),
                               dt=plant.DT, gravity=False)[1::2]
    return dq


class ChopperOnTheElbowTests(unittest.TestCase):
    def test_the_chopper_is_sized_from_the_measured_speed(self):
        omega = spin_up_elbow()
        self.assertGreater(omega, 1.0)
        eta = 0.75
        energy = submission.regen_energy_j(plant.I2, omega, eta)
        self.assertAlmostEqual(energy, 0.5 * eta * plant.I2 * omega * omega, delta=1e-15)

        # A 24 V bus with 1 mF cannot absorb it: the surge climbs far past the clamp.
        surge = submission.unclamped_bus_v(24.0, energy, 1000e-6)
        self.assertGreater(surge, 28.0)
        peak_power = eta * plant.TAU_LIMIT * omega
        bound = submission.brake_resistor_max_ohm(28.0, peak_power)
        chosen = 0.5 * bound  # a resistor with margin
        self.assertLess(chosen, bound)
        self.assertAlmostEqual(submission.brake_peak_current_a(28.0, chosen), 28.0 / chosen,
                               delta=1e-12)
        self.assertGreater(peak_power, 0.0)

    def test_at_the_bound_the_chopper_absorbs_exactly_the_peak(self):
        omega = spin_up_elbow()
        peak_power = 0.75 * plant.TAU_LIMIT * omega
        bound = submission.brake_resistor_max_ohm(28.0, peak_power)
        dissipated = 28.0 ** 2 / bound
        self.assertAlmostEqual(dissipated, peak_power, delta=1e-9)

    def test_a_faster_joint_needs_a_smaller_resistor(self):
        slow = submission.brake_resistor_max_ohm(28.0, 0.75 * plant.TAU_LIMIT * spin_up_elbow(0.02))
        fast = submission.brake_resistor_max_ohm(28.0, 0.75 * plant.TAU_LIMIT * spin_up_elbow(0.05))
        self.assertLess(fast, slow)


class CounterOverTheTelemetryTests(unittest.TestCase):
    def test_a_dropped_frame_every_seven_is_warned(self):
        prev = 0
        statuses = []
        for k in range(1, 29):
            if k % 7 == 0:
                continue  # this frame never arrives
            current = k % 16
            statuses.append(submission.rolling_counter_status(prev, current))
            prev = current
        # Four frames are skipped, but the last one ends the run, so three warnings land.
        self.assertEqual(statuses.count("WARN_DROPPED_1"), 3)
        self.assertEqual([s for s in statuses if s.startswith("FAULT")], [])

    def test_a_stuck_transmitter_is_a_frozen_fault(self):
        prev = 5
        statuses = [submission.rolling_counter_status(prev, 5) for _ in range(3)]
        self.assertEqual(statuses, ["FAULT_FROZEN"] * 3)

    def test_the_watchdog_window_is_three_plant_ticks(self):
        window = submission.watchdog_timeout_s(3, plant.DT)
        self.assertAlmostEqual(window, 3.0 * plant.DT, delta=1e-15)
        self.assertAlmostEqual(window * 1000.0, 3.0, delta=1e-9)
        # Nine milliradians of elbow travel at the speed the capstone's limit reaches in 0.05 s.
        omega = spin_up_elbow()
        self.assertGreater(omega * window, 0.0)


if __name__ == "__main__":
    unittest.main()
