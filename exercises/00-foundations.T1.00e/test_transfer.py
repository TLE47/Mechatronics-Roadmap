"""Transfer tests for 00-foundations.T1.00e - the same two laws on the plant's own numbers.

Three claims, each measured rather than asserted:
  1. the module's `tau = r F sin(phi)` is the plant's `tau_g = m g L cos(q)` seen from the force's
     side: at q1 measured from horizontal, the angle between the link and gravity is `pi/2 - q1`,
     so the submission must reproduce the plant's shoulder torque at every pose;
  2. the plant's 2.5 N*m clamp over each joint's own inertia is an angular acceleration the
     module's `tau/J` computes exactly - 312.5 rad/s^2 at the shoulder, 833.3 at the elbow;
  3. the plant's 1 ms tick is 1257 times finer than the 1.26 s period of a 2 kg / 50 N/m spring,
     which is why one second (1000 ticks) of the module's loop holds its energy, and why a
     joint coasting under the plant's `I1/B1 = 0.2 s` obeys the same first-order decay.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

POSES = (0.0, 0.4, -1.1, math.pi / 2.0)


class LeverAgainstThePlantTests(unittest.TestCase):
    def test_the_sine_law_reproduces_the_plants_cosine_law(self):
        # With the elbow straight (q2 = 0) all three levers point along q1 - the first link's own
        # centre of mass, the second link carried at the tip, and that link's own centre of mass -
        # so gravity's angle to each is pi/2 - q1 and they must add up to the plant's shoulder torque.
        for q1 in POSES:
            mine = (
                submission.torque(plant.M1 * plant.G, plant.LC1, math.pi / 2.0 - q1)
                + submission.torque(plant.M2 * plant.G, plant.L1, math.pi / 2.0 - q1)
                + submission.torque(plant.M2 * plant.G, plant.LC2, math.pi / 2.0 - q1)
            )
            self.assertAlmostEqual(mine, plant.gravity_torque(q1, 0.0)[0], delta=1e-12,
                                   msg="shoulder at q1=%g" % q1)

    def test_the_plants_link_mass_is_the_heaviest_case_horizontal(self):
        # 0.318825 N*m horizontal (three levers at full length), and nothing with the arm straight up.
        self.assertAlmostEqual(plant.gravity_torque(0.0, 0.0)[0], 0.318825, delta=1e-12)
        self.assertAlmostEqual(plant.gravity_torque(math.pi / 2.0, 0.0)[0], 0.0, delta=1e-12)


class ClampAgainstTheInertiaTests(unittest.TestCase):
    def test_the_shoulder_clamp_over_the_shoulder_inertia(self):
        # 2.5 N*m / 0.008 kg*m^2 = 312.5 rad/s^2.
        self.assertAlmostEqual(submission.angular_acceleration(plant.TAU_LIMIT, plant.I1),
                               312.5, delta=1e-12)

    def test_the_elbow_clamp_over_the_elbow_inertia(self):
        # 2.5 / 0.003 = 833.333... rad/s^2, the joint that accelerates 2.67x faster.
        self.assertAlmostEqual(submission.angular_acceleration(plant.TAU_LIMIT, plant.I2),
                               2500.0 / 3.0, delta=1e-9)
        self.assertAlmostEqual(
            submission.angular_acceleration(plant.TAU_LIMIT, plant.I2)
            / submission.angular_acceleration(plant.TAU_LIMIT, plant.I1),
            plant.I1 / plant.I2, delta=1e-12)


class TickAgainstTheSpringTests(unittest.TestCase):
    def test_the_plants_tick_is_far_finer_than_the_spring_period(self):
        # T = 2*pi*sqrt(2/50) = 1.256637 s; T/DT = 1256.6 ticks per oscillation, so the module's
        # "dt <= T/50" rule has a factor of 25 to spare at the plant's 1 kHz.
        period = 2.0 * math.pi * math.sqrt(2.0 / 50.0)
        self.assertAlmostEqual(period / plant.DT, 1256.6370614359172, delta=1e-9)
        self.assertGreater(period / plant.DT, 50.0)

    def test_one_second_at_the_plants_tick_keeps_the_energy(self):
        x, v = 0.10, 0.0
        for _ in range(plant.TICKS):
            x, v = submission.euler_step(x, v, 50.0, 0.0, 2.0, plant.DT)
        start = submission.mechanical_energy(2.0, 0.0, 50.0, 0.10)
        self.assertAlmostEqual(start, 0.25, delta=1e-15)
        self.assertAlmostEqual(submission.mechanical_energy(2.0, v, 50.0, x) / start,
                               1.0, delta=0.01)

    def test_a_coasting_joint_decays_with_the_plants_time_constant(self):
        # The plant's shoulder coasts with I1/B1 = 0.2 s. The same first-order law in the
        # module's loop: a free mass (k = 0) with b/m = 5 s^-1 loses 63.2% of its speed in 0.2 s.
        self.assertAlmostEqual(plant.I1 / plant.B1, 0.2, delta=1e-15)
        _x, v = 1.0, 1.0
        for _ in range(200):
            _x, v = submission.euler_step(_x, v, 0.0, 5.0, 1.0, 0.001)
        self.assertAlmostEqual(v, math.exp(-1.0), delta=0.01 * math.exp(-1.0))


if __name__ == "__main__":
    unittest.main()
