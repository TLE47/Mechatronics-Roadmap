"""Transfer tests for 01-electronics.T1.01d - the same two laws on the plant's own constants.

Three claims:
  1. a 1 uF capacitor with a 159.155 ohm resistor has its -3 dB corner exactly on the plant's 1 kHz
     tick, which is what "a filter matched to the control loop" means;
  2. the plant's own first-order mechanical lag, inertia over damping, obeys the module's charging
     law: 63.2% after one time constant and 99.3% after five;
  3. the flyback spike from a 3 mH coil at 2 A dwarfs the 12 V bus it would be clamped to, by more
     than two orders of magnitude.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class FilterCornerTests(unittest.TestCase):
    def test_the_filter_corner_is_the_plants_tick(self):
        # Pick R so that R * 1 uF puts fc on the plant's 1 kHz sample rate.
        r_ohm = 1.0 / (2.0 * math.pi * (1.0 / plant.DT) * 1e-6)
        self.assertAlmostEqual(submission.rc_cutoff_hz(r_ohm, 1e-6), 1.0 / plant.DT, delta=1e-9)

    def test_the_plants_tick_is_one_millisecond(self):
        self.assertAlmostEqual(submission.rc_time_constant(1000.0, 1e-6), plant.DT, delta=1e-12)


class MechanicalTimeConstantTests(unittest.TestCase):
    def test_the_plants_inertia_over_damping_obeys_the_same_law(self):
        tau_mech = plant.I1 / plant.B1  # 0.2 s for the shoulder
        one = submission.rc_voltage(tau_mech, 1.0, 1.0, tau_mech)
        five = submission.rc_voltage(5.0 * tau_mech, 1.0, 1.0, tau_mech)
        self.assertAlmostEqual(tau_mech, 0.2, delta=1e-12)
        self.assertAlmostEqual(one, 1.0 - math.exp(-1.0), delta=1e-12)
        self.assertAlmostEqual(five, 1.0 - math.exp(-5.0), delta=1e-12)
        self.assertGreater(five, 0.99)

    def test_the_elbow_is_quicker_than_the_shoulder(self):
        shoulder = submission.rc_time_constant(1.0, plant.I1 / plant.B1)
        elbow = submission.rc_time_constant(1.0, plant.I2 / plant.B2)
        self.assertLess(elbow, shoulder)


class FlybackAgainstTheBusTests(unittest.TestCase):
    def test_the_spike_dwarfs_a_twelve_volt_bus(self):
        spike = submission.flyback_voltage(0.003, 2.0, 0.5e-6)
        self.assertAlmostEqual(spike, 12_000.0, delta=1e-6)
        self.assertGreater(spike, 500.0 * 12.7)

    def test_the_clamped_node_stays_at_the_bus(self):
        v_bus, v_f = 12.0, 0.7
        clamped = v_bus + v_f
        spike = submission.flyback_voltage(0.003, 2.0, 0.5e-6)
        self.assertAlmostEqual(clamped, 12.7, delta=1e-12)
        self.assertLess(clamped, spike / 100.0)


if __name__ == "__main__":
    unittest.main()
