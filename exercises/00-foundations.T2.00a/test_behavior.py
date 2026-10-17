"""Behaviour tests for 00-foundations.T2.00a.

Each test names the mistake it catches:
  * a velocity that never divided by `dt`, or one that ignores `cpr`;
  * an unwrapped difference at the encoder's zero (a 4095 -> 0 step is +1 count, not -4095);
  * a running integral that is not running (re-integrating from zero each step);
  * a matrix built from remembered numbers rather than the caller's m, k, b, dt;
  * a one-step update that overwrites `x` before computing `v` - correct only when v is zero;
  * a round trip that does not land back on the encoder's angle.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


ONE_COUNT = 2.0 * math.pi / plant.ENCODER_CPR


def counts_from_angles(angles, cpr=plant.ENCODER_CPR):
    return [plant.encoder_counts(a, cpr=cpr) for a in angles]


class VelocityTests(unittest.TestCase):
    def test_constant_speed_is_recovered(self):
        # One count per sample: the only speed a 12-bit encoder can hold exactly.
        counts = list(range(6))
        got = submission.joint_velocity(counts, 1e-3)
        self.assertEqual(len(got), len(counts))
        self.assertEqual(got[0], 0.0)
        for value in got[1:]:
            self.assertAlmostEqual(value, ONE_COUNT / 1e-3, delta=1e-6)

    def test_divides_by_the_sample_time(self):
        counts = list(range(4))
        slow = submission.joint_velocity(counts, 1e-2)
        fast = submission.joint_velocity(counts, 1e-3)
        self.assertGreater(fast[1], 0.0)
        self.assertAlmostEqual(slow[1] * 10.0, fast[1], delta=1e-6)

    def test_uses_the_counts_per_revolution_it_is_given(self):
        counts = [0, 1, 2, 3]
        fine = submission.joint_velocity(counts, 1e-3, cpr=4096)
        coarse = submission.joint_velocity(counts, 1e-3, cpr=1024)
        self.assertAlmostEqual(fine[1], ONE_COUNT / 1e-3, delta=1e-6)
        self.assertAlmostEqual(coarse[1], 4.0 * fine[1], delta=1e-6)

    def test_wraps_across_encoder_zero(self):
        counts = [4094, 4095, 0, 1, 2]
        got = submission.joint_velocity(counts, 1e-3)
        for value in got[1:]:
            self.assertAlmostEqual(value, ONE_COUNT / 1e-3, delta=1e-6)


class IntegralTests(unittest.TestCase):
    def test_constant_input(self):
        got = submission.running_integral([2.0, 2.0, 2.0], 0.5)
        for expected, value in zip([1.0, 2.0, 3.0], got):
            self.assertAlmostEqual(value, expected, delta=1e-12)

    def test_is_running_not_restarted(self):
        got = submission.running_integral([1.0, 2.0, 3.0, 4.0], 0.1)
        for index, value in enumerate(got, start=1):
            self.assertAlmostEqual(value, 0.1 * sum(range(1, index + 1)), delta=1e-12)

    def test_inverts_the_velocity_estimate(self):
        angles = [0.0007 * k * k for k in range(12)]
        counts = counts_from_angles(angles)
        velocity = submission.joint_velocity(counts, 1e-3)
        integrated = submission.running_integral(velocity, 1e-3)
        first = plant.counts_to_rad(counts[0])
        for index, value in enumerate(integrated):
            expected = plant.counts_to_rad(counts[index]) - first
            self.assertAlmostEqual(value, expected, delta=1e-6)


class MatrixTests(unittest.TestCase):
    def test_matches_the_worked_example(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        self.assertAlmostEqual(Ad[0][0], 1.0, delta=1e-12)
        self.assertAlmostEqual(Ad[0][1], 0.01, delta=1e-12)
        self.assertAlmostEqual(Ad[1][0], -1.0, delta=1e-12)
        self.assertAlmostEqual(Ad[1][1], 0.90, delta=1e-12)
        self.assertAlmostEqual(Bd[0], 0.0, delta=1e-12)
        self.assertAlmostEqual(Bd[1], 0.01, delta=1e-12)

    def test_uses_every_parameter_it_is_given(self):
        Ad, Bd = submission.state_matrices(2.0, 50.0, 4.0, 0.002)
        self.assertAlmostEqual(Ad[0][1], 0.002, delta=1e-12)
        self.assertAlmostEqual(Ad[1][0], -0.05, delta=1e-12)
        self.assertAlmostEqual(Ad[1][1], 1.0 - 0.004, delta=1e-12)
        self.assertAlmostEqual(Bd[1], 0.001, delta=1e-12)


class StepTests(unittest.TestCase):
    def test_simultaneous_update(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        got = submission.one_step(Ad, Bd, [0.10, 0.20], 0.0)
        self.assertAlmostEqual(got[0], 0.10 + 0.01 * 0.20, delta=1e-12)
        self.assertAlmostEqual(got[1], -1.0 * 0.10 + 0.90 * 0.20, delta=1e-12)
        sequential_v = -1.0 * got[0] + 0.90 * 0.20
        self.assertGreater(abs(got[1] - sequential_v), 1e-4,
                           "this state separates a simultaneous update from an ordered one")

    def test_matches_the_scalar_update(self):
        m, k, b, dt = 1.0, 100.0, 10.0, 0.01
        Ad, Bd = submission.state_matrices(m, k, b, dt)
        x = [0.10, 0.35]
        u = 5.0
        got = submission.one_step(Ad, Bd, x, u)
        self.assertAlmostEqual(got[0], x[0] + dt * x[1], delta=1e-12)
        self.assertAlmostEqual(got[1], x[1] + dt * ((-k * x[0] - b * x[1] + u) / m), delta=1e-12)

    def test_simulate_converges_to_static_equilibrium(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        final = submission.simulate(Ad, Bd, [0.10, 0.0], 5.0, 500)
        self.assertAlmostEqual(final[0], 0.05, delta=1e-3)
        self.assertAlmostEqual(final[1], 0.0, delta=1e-4)


class TraceTests(unittest.TestCase):
    def test_round_trip_lands_on_the_encoder_angle(self):
        angles = [0.3 + 0.02 * k for k in range(20)]
        counts = counts_from_angles(angles)
        trace = submission.encoder_trace_angle(counts, 1e-3)
        self.assertEqual(len(trace), len(counts))
        one_count = 2.0 * math.pi / plant.ENCODER_CPR
        for index, value in enumerate(trace):
            self.assertAlmostEqual(value, plant.counts_to_rad(counts[index]), delta=one_count + 1e-9)


if __name__ == "__main__":
    unittest.main()
