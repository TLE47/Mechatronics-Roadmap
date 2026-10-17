"""Transfer tests for 05-control.T3.05a - the same three laws on the plant's own numbers.

Six claims, measured on the shared arm:
  1. the plant's 1 kHz tick is exactly one time constant of a 1000 s^-1 barrier, so the guaranteed
     margin decays to h0/e in a single control period;
  2. at a 0.05 rad margin that barrier allows 50 rad/s - far above anything the joint does - while
     a 0.50 rad/s command passes untouched, which is what "minimally invasive" buys;
  3. the plant's 2.5 N*m clamp over its 0.008 kg*m^2 shoulder removes 0.3125 rad/s per tick, so the
     stopping distance from that speed is 1.5625e-4 rad - a margin a metre-per-second barrier must
     brake for while a position-only intuition would ignore it;
  4. at the optimal gain the Joseph form reproduces the scalar Riccati solution P R / (P + R);
  5. a gain 20% larger than optimal drives the naive update negative at the plant's inertia, where
     the Joseph form stays positive;
  6. one encoder count is a 3D tangent-space step whose exp() is still in SO(3), and a one-count
     error measured against the encoder's own quantisation variance has a NEES of exactly 12.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

ONE_COUNT = 2.0 * math.pi / plant.ENCODER_CPR


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


class PlantCovarianceTests(unittest.TestCase):
    def test_joseph_matches_the_riccati_solution_at_the_optimal_gain(self):
        # P R / (P + R) with P = I1 and a 1e-6 rad^2 sensor: the two forms must agree exactly.
        gain = submission.optimal_gain(plant.I1, 1.0, 1e-6)
        posterior = submission.joseph_variance(plant.I1, 1.0, 1e-6, gain)
        self.assertAlmostEqual(posterior, plant.I1 * 1e-6 / (plant.I1 + 1e-6), delta=1e-18)
        self.assertAlmostEqual(posterior, 9.998750156230471e-7, delta=1e-18)

    def test_a_twenty_percent_overconfident_gain_goes_negative_naively(self):
        # R = 1e-3 against a 0.008 prior gives K_opt = 0.8889; 1.2 K_opt = 1.0667 > 1, so the
        # naive update is -5.3333e-4 while the Joseph form is 1.1733e-3.
        gain = 1.2 * submission.optimal_gain(plant.I1, 1.0, 1e-3)
        naive = (1.0 - gain) * plant.I1
        joseph = submission.joseph_variance(plant.I1, 1.0, 1e-3, gain)
        self.assertLess(naive, 0.0)
        self.assertAlmostEqual(naive, -5.333333333333332e-4, delta=1e-15)
        self.assertAlmostEqual(joseph, 1.173333333333333e-3, delta=1e-15)
        self.assertGreater(joseph, 0.0)


class EncoderTangentSpaceTests(unittest.TestCase):
    def test_one_encoder_count_is_a_tangent_space_step(self):
        # A 4096-count encoder resolves 2 pi / 4096 rad; exp() of that step is a genuine rotation.
        self.assertAlmostEqual(ONE_COUNT, 0.0015339807878856412, delta=1e-18)
        rotation = submission.exp_so3([0.0, 0.0, ONE_COUNT])
        determinant = (
            rotation[0][0] * (rotation[1][1] * rotation[2][2] - rotation[1][2] * rotation[2][1])
            - rotation[0][1] * (rotation[1][0] * rotation[2][2] - rotation[1][2] * rotation[2][0])
            + rotation[0][2] * (rotation[1][0] * rotation[2][1] - rotation[1][1] * rotation[2][0])
        )
        self.assertAlmostEqual(determinant, 1.0, delta=1e-15)
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    sum(rotation[i][k] * rotation[j][k] for k in range(3)),
                    1.0 if i == j else 0.0, delta=1e-15)

    def test_the_angle_actually_injected_is_one_count(self):
        # Injecting one count into the identity must turn the body by exactly that count.
        rotation = submission.inject_rotation(
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], [0.0, 0.0, ONE_COUNT])
        trace = rotation[0][0] + rotation[1][1] + rotation[2][2]
        # acos loses a couple of ulp at this angle, so the count is pinned to 1e-12, not 1e-15.
        self.assertAlmostEqual(math.acos(max(-1.0, min(1.0, (trace - 1.0) / 2.0))), ONE_COUNT,
                               delta=1e-12)

    def test_a_one_count_error_against_quantisation_is_a_nees_of_twelve(self):
        # Uniform quantisation of one count has variance (count^2 / 12), so a full-count error is
        # exactly twelve sigma^2: NEES = 12, the number that says the filter was honest.
        variance = ONE_COUNT * ONE_COUNT / 12.0
        self.assertAlmostEqual(submission.nees_diagonal([ONE_COUNT], [variance]), 12.0,
                               delta=1e-9)
        # Half a count is a quarter of the squared error: NEES = 3, still consistent.
        self.assertAlmostEqual(
            submission.nees_diagonal([ONE_COUNT / 2.0], [variance]), 3.0, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
