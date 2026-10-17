"""Transfer tests for 05-control.T3.05c - the same filter on the plant's own numbers.

Three claims, measured on the shared arm:
  1. the plant's 1 kHz tick is exactly one time constant of a 1000 s^-1 barrier, so the guaranteed
     margin decays to h0/e in a single control period;
  2. at a 0.05 rad margin that barrier allows 50 rad/s - far above anything the joint does - while
     a 0.50 rad/s command passes untouched, which is what "minimally invasive" buys;
  3. the plant's 2.5 N*m clamp over its 0.008 kg*m^2 shoulder removes 0.3125 rad/s per tick, so the
     stopping distance from that speed is 1.5625e-4 rad - a margin a metre-per-second barrier must
     brake for while a position-only intuition would ignore it.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class DispatchBarrierTests(unittest.TestCase):
    def test_the_plant_tick_is_one_time_constant(self):
        # alpha = 1 / DT = 1000 s^-1, t = DT = 1 ms: the margin falls to exp(-1) in one period.
        margin = submission.barrier_lower_bound(0.05, 1.0 / plant.DT, plant.DT)
        self.assertAlmostEqual(margin, 0.05 * math.exp(-1.0), delta=1e-15)

    def test_the_barrier_speed_limit_and_a_passthrough(self):
        # h = 0.05 rad, alpha = 1000 s^-1: the constraint u <= 50 rad/s is nowhere near binding.
        self.assertAlmostEqual(submission.cbf_command(0.50, 0.05, 1.0 / plant.DT, -5.0, 5.0),
                               0.50, delta=1e-15)
        self.assertAlmostEqual(0.05 / plant.DT, 50.0, delta=1e-9)

    def test_the_clamp_brakes_inside_one_tick(self):
        # a = 2.5 / 0.008 = 312.5 rad/s^2; one tick of it changes the speed by 0.3125 rad/s, and the
        # distance to stop from there is v^2 / (2a) = 1.5625e-4 rad.
        accel = plant.TAU_LIMIT / plant.I1
        self.assertAlmostEqual(accel, 312.5, delta=1e-12)
        speed = accel * plant.DT
        self.assertAlmostEqual(speed, 0.3125, delta=1e-15)
        distance = speed * speed / (2.0 * accel)
        self.assertAlmostEqual(distance, 1.5625e-4, delta=1e-18)
        self.assertAlmostEqual(distance, plant.TAU_LIMIT * plant.DT ** 2 / (2.0 * plant.I1),
                               delta=1e-18)
        # A 1000 s^-1 barrier at that margin allows only 0.15625 rad/s, so it must brake a 0.3125
        # rad/s approach - the stopping distance is the margin that matters, not 0.
        self.assertAlmostEqual(submission.cbf_command(speed, distance, 1.0 / plant.DT,
                                                      -5.0, 5.0),
                               0.15625, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
