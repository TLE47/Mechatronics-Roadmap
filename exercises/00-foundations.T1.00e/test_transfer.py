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
            self.assertAlmostEqual(
                mine, plant.gravity_torque(q1, 0.0)[0], delta=1e-12,
                msg="expected the three lever terms at pi/2 - q1 to reproduce the plant's own "
                    "shoulder torque at every pose this list covers, including the horizontal and "
                    "straight-up cases; a mismatch means the sine law is not the cosine law seen "
                    "from the force's side - check the angle complement",
            )

    def test_the_plants_link_mass_is_the_heaviest_case_horizontal(self):
        # 0.318825 N*m horizontal (three levers at full length), and nothing with the arm straight up.
        self.assertAlmostEqual(
            plant.gravity_torque(0.0, 0.0)[0], 0.318825, delta=1e-12,
            msg="expected the plant's straight arm to hold 0.318825 N*m horizontally; another "
                "value means the plant's masses or lever arms changed and every comparison in "
                "this file is against stale numbers - check M1, LC1, M2, L1, LC2",
        )
        self.assertAlmostEqual(
            plant.gravity_torque(math.pi / 2.0, 0.0)[0], 0.0, delta=1e-12,
            msg="expected the fully raised arm to need no holding torque at all, whatever the "
                "masses; a nonzero value means the plant's gravity model is not the cosine law "
                "the module works from",
        )


class ClampAgainstTheInertiaTests(unittest.TestCase):
    def test_the_shoulder_clamp_over_the_shoulder_inertia(self):
        # 2.5 N*m / 0.008 kg*m^2 = 312.5 rad/s^2.
        self.assertAlmostEqual(
            submission.angular_acceleration(plant.TAU_LIMIT, plant.I1), 312.5, delta=1e-12,
            msg="expected the plant's 2.5 N*m clamp over its 0.008 kg m^2 shoulder to give 312.5 "
                "rad/s^2; 2500 means the inertia was divided by the torque - check tau / J",
        )

    def test_the_elbow_clamp_over_the_elbow_inertia(self):
        # 2.5 / 0.003 = 833.333... rad/s^2, the joint that accelerates 2.67x faster.
        self.assertAlmostEqual(
            submission.angular_acceleration(plant.TAU_LIMIT, plant.I2), 2500.0 / 3.0, delta=1e-9,
            msg="expected the same clamp over the elbow's 0.003 kg m^2 to give 833.33 rad/s^2; a "
                "value near 312.5 means the shoulder's inertia was used - check I2",
        )
        self.assertAlmostEqual(
            submission.angular_acceleration(plant.TAU_LIMIT, plant.I2)
            / submission.angular_acceleration(plant.TAU_LIMIT, plant.I1),
            plant.I1 / plant.I2, delta=1e-12,
            msg="expected the elbow to accelerate exactly I1/I2 times faster than the shoulder, "
                "2.667x, since the clamp is shared; a different ratio means one call used another "
                "joint's inertia",
        )


class TickAgainstTheSpringTests(unittest.TestCase):
    def test_the_plants_tick_is_far_finer_than_the_spring_period(self):
        # T = 2*pi*sqrt(2/50) = 1.256637 s; T/DT = 1256.6 ticks per oscillation, so the module's
        # "dt <= T/50" rule has a factor of 25 to spare at the plant's 1 kHz.
        period = 2.0 * math.pi * math.sqrt(2.0 / 50.0)
        self.assertAlmostEqual(
            period / plant.DT, 1256.6370614359172, delta=1e-9,
            msg="expected a 2 kg / 50 N/m spring's 1.2566 s period to span 1256.6 plant ticks; a "
                "value near 1.26 means the tick rate was left in seconds - check DT",
        )
        self.assertGreater(
            period / plant.DT, 50.0,
            msg="expected the plant to resolve the spring with far more than the module's fifty "
                "samples per period; a smaller count means the plant's tick is too coarse for "
                "this spring and the energy claim below would be meaningless",
        )

    def test_one_second_at_the_plants_tick_keeps_the_energy(self):
        x, v = 0.10, 0.0
        for _ in range(plant.TICKS):
            x, v = submission.euler_step(x, v, 50.0, 0.0, 2.0, plant.DT)
        start = submission.mechanical_energy(2.0, 0.0, 50.0, 0.10)
        self.assertAlmostEqual(
            start, 0.25, delta=1e-15,
            msg="expected the initial 0.10 m of a 50 N/m spring to store 0.25 J; another value "
                "means the energy formula squares the wrong term - check 1/2 k x^2",
        )
        self.assertAlmostEqual(
            submission.mechanical_energy(2.0, v, 50.0, x) / start, 1.0, delta=0.01,
            msg="expected one second of Euler steps at the plant's 1 kHz to hold the spring's "
                "energy within one percent; a larger drift means the step is too coarse or the "
                "scheme unstable - check the update order",
        )

    def test_a_coasting_joint_decays_with_the_plants_time_constant(self):
        # The plant's shoulder coasts with I1/B1 = 0.2 s. The same first-order law in the
        # module's loop: a free mass (k = 0) with b/m = 5 s^-1 loses 63.2% of its speed in 0.2 s.
        self.assertAlmostEqual(
            plant.I1 / plant.B1, 0.2, delta=1e-15,
            msg="expected the plant's shoulder to coast with a 0.2 s time constant; another value "
                "means the inertia or the damping changed and this comparison is against a "
                "different joint - check I1 / B1",
        )
        _x, v = 1.0, 1.0
        for _ in range(200):
            _x, v = submission.euler_step(_x, v, 0.0, 5.0, 1.0, 0.001)
        self.assertAlmostEqual(
            v, math.exp(-1.0), delta=0.01 * math.exp(-1.0),
            msg="expected a free mass losing speed at 5 per second to keep exp(-1), 36.8 percent, "
                "after 0.2 s; a value near 1.0 means the damping term never reached the velocity "
                "update - check the b/m term",
        )


if __name__ == "__main__":
    unittest.main()
