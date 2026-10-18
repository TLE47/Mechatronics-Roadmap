"""Behaviour tests for 00-foundations.T2.00g.

Each test names the mistake it catches:
  * a matrix-vector product that multiplies elementwise, or only uses the diagonal;
  * a shape mismatch that is silently truncated instead of refused;
  * a one-step update that writes x back before computing v;
  * a matrix built from remembered numbers rather than the caller's m, k, b, dt;
  * a 4x4 two-mass matrix whose off-diagonal coupling is missing;
  * a trace that starts after the first step, or stops one sample short.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class MatrixTests(unittest.TestCase):
    def test_matches_the_hand_product(self):
        A = [[2.0, -1.0], [0.5, 3.0]]
        got = submission.mat_vec(A, [4.0, 2.0])
        self.assertEqual(len(got), 2)
        self.assertAlmostEqual(got[0], 6.0, delta=1e-12)
        self.assertAlmostEqual(got[1], 8.0, delta=1e-12)

    def test_rectangular_matrix_and_three_rows(self):
        A = [[1.0, 2.0, 3.0], [-1.0, 0.0, 1.0], [0.5, 0.5, 0.5]]
        got = submission.mat_vec(A, [1.0, 2.0, 3.0])
        self.assertEqual(got, [14.0, 2.0, 3.0])

    def test_refuses_a_column_that_does_not_match_the_rows(self):
        with self.assertRaises(ValueError):
            submission.mat_vec([[1.0, 2.0], [3.0, 4.0]], [1.0, 2.0, 3.0])

    def test_refuses_a_ragged_matrix(self):
        with self.assertRaises(ValueError):
            submission.mat_vec([[1.0, 2.0], [3.0]], [1.0, 2.0])


class StepTests(unittest.TestCase):
    def test_simultaneous_update(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        # The velocity in x is non-zero on purpose: with v = 0 an ordered update is invisible.
        got = submission.one_step(Ad, Bd, [0.10, 0.20], 0.0)
        self.assertAlmostEqual(got[0], 0.10 + 0.01 * 0.20, delta=1e-12)
        self.assertAlmostEqual(got[1], -1.0 * 0.10 + 0.90 * 0.20, delta=1e-12)
        sequential_v = -1.0 * got[0] + 0.90 * 0.20
        self.assertGreater(abs(got[1] - sequential_v), 1e-4,
                           "this state separates a simultaneous update from an ordered one")

    def test_refuses_a_state_of_the_wrong_length(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        with self.assertRaises(ValueError):
            submission.one_step(Ad, Bd, [0.10], 5.0)

    def test_matches_the_scalar_update(self):
        m, k, b, dt = 1.0, 100.0, 10.0, 0.01
        Ad, Bd = submission.state_matrices(m, k, b, dt)
        x, u = [0.10, 0.35], 5.0
        got = submission.one_step(Ad, Bd, x, u)
        self.assertAlmostEqual(got[0], x[0] + dt * x[1], delta=1e-12)
        self.assertAlmostEqual(got[1], x[1] + dt * ((-k * x[0] - b * x[1] + u) / m), delta=1e-12)

    def test_converges_to_static_equilibrium(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        final = submission.simulate(Ad, Bd, [0.10, 0.0], 5.0, 500)
        self.assertAlmostEqual(final[0], 0.05, delta=1e-3)
        self.assertAlmostEqual(final[1], 0.0, delta=1e-4)

    def test_simulate_is_the_repeated_step(self):
        Ad, Bd = submission.state_matrices(2.0, 50.0, 4.0, 0.002)
        x = [0.0, 0.0]
        for _ in range(7):
            x = submission.one_step(Ad, Bd, x, 3.0)
        got = submission.simulate(Ad, Bd, [0.0, 0.0], 3.0, 7)
        for expected, value in zip(x, got):
            self.assertAlmostEqual(value, expected, delta=1e-12)

    def test_refuses_negative_steps(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        with self.assertRaises(ValueError):
            submission.simulate(Ad, Bd, [0.0, 0.0], 0.0, -1)


class PlantTests(unittest.TestCase):
    def test_state_matrices_use_every_parameter(self):
        slow, _ = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        fast, fast_b = submission.state_matrices(2.0, 50.0, 4.0, 0.002)
        self.assertAlmostEqual(slow[0][1], 0.01, delta=1e-12)
        self.assertAlmostEqual(fast[0][1], 0.002, delta=1e-12)
        self.assertAlmostEqual(fast[1][0], -0.05, delta=1e-12)
        self.assertAlmostEqual(fast[1][1], 1.0 - 0.004, delta=1e-12)
        self.assertAlmostEqual(fast_b[1], 0.001, delta=1e-12)

    def test_refuses_a_zero_mass(self):
        with self.assertRaises(ValueError):
            submission.state_matrices(0.0, 100.0, 10.0, 0.01)


class TwoMassTests(unittest.TestCase):
    def test_uncoupled_blocks_reduce_to_the_two_state_matrices(self):
        Ad, Bd = submission.two_mass_matrices(1.0, 4.0, 0.0, 0.0, 0.01)
        first, first_b = submission.state_matrices(1.0, 0.0, 0.0, 0.01)
        second, _ = submission.state_matrices(4.0, 0.0, 0.0, 0.01)
        self.assertEqual([row[:2] for row in Ad[:2]], first)
        self.assertEqual([row[2:] for row in Ad[2:]], second)
        self.assertEqual(Bd, [first_b[0], first_b[1], 0.0, 0.0])

    def test_coupling_eventually_drags_the_second_mass_along(self):
        Ad, Bd = submission.two_mass_matrices(1.0, 2.0, 50.0, 3.0, 0.001)
        final = submission.simulate(Ad, Bd, [0.0, 0.0, 0.0, 0.0], 1.0, 6000)
        self.assertAlmostEqual(final[0], final[2], delta=2e-2)
        self.assertGreater(final[0], 1e-2)


class TraceTests(unittest.TestCase):
    def test_trace_starts_at_the_initial_position(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        trace = submission.position_trace(Ad, Bd, [0.10, 0.0], 5.0, 4)
        self.assertEqual(len(trace), 5)
        self.assertAlmostEqual(trace[0], 0.10, delta=1e-12)
        # Position only moves once velocity is non-zero: step 1 still reads 0.10.
        self.assertAlmostEqual(trace[1], 0.10, delta=1e-12)
        # v1 = -1.0*0.10 + 0.01*5.0 = -0.05, so x2 = 0.10 + 0.01*(-0.05).
        self.assertAlmostEqual(trace[2], 0.0995, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
