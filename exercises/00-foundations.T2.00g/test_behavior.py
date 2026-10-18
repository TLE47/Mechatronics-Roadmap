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
        self.assertEqual(
            len(got), 2,
            msg="expected one output per row, so two; a shorter list likely dropped a row or "
                "returned a scalar - check the product keeps the matrix's height",
        )
        self.assertAlmostEqual(
            got[0], 6.0, delta=1e-12,
            msg="expected 2*4 - 1*2 = 6 for the first row; 8 likely summed the row instead of "
                "the column dot - check row-by-column products",
        )
        self.assertAlmostEqual(
            got[1], 8.0, delta=1e-12,
            msg="expected 0.5*4 + 3*2 = 8 for the second row; 7 likely used the same row for "
                "both outputs - check each row is paired with the vector",
        )

    def test_rectangular_matrix_and_three_rows(self):
        A = [[1.0, 2.0, 3.0], [-1.0, 0.0, 1.0], [0.5, 0.5, 0.5]]
        got = submission.mat_vec(A, [1.0, 2.0, 3.0])
        self.assertEqual(
            got, [14.0, 2.0, 3.0],
            msg="expected [14, 2, 3] for this 3x3 product; 12 or 6 likely truncated the vector "
                "to two entries - check the row length sets the dot product",
        )

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
        self.assertAlmostEqual(
            got[0], 0.10 + 0.01 * 0.20, delta=1e-12,
            msg="expected the position to advance by Ts times the old velocity, 0.102; 0.101 "
                "likely used an already-updated velocity - check the step is simultaneous",
        )
        self.assertAlmostEqual(
            got[1], -1.0 * 0.10 + 0.90 * 0.20, delta=1e-12,
            msg="expected the velocity to use the OLD position, 0.08; 0.08 from the new position "
                "would be a different number - check both rows read the same x",
        )
        sequential_v = -1.0 * got[0] + 0.90 * 0.20
        self.assertGreater(
            abs(got[1] - sequential_v), 1e-4,
            msg="expected this state to separate a simultaneous update from an ordered one, so "
                "the two answers differ by more than 1e-4; equality means the test state stopped "
                "discriminating - check the velocity is not zero",
        )

    def test_refuses_a_state_of_the_wrong_length(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        with self.assertRaises(ValueError):
            submission.one_step(Ad, Bd, [0.10], 5.0)

    def test_matches_the_scalar_update(self):
        m, k, b, dt = 1.0, 100.0, 10.0, 0.01
        Ad, Bd = submission.state_matrices(m, k, b, dt)
        x, u = [0.10, 0.35], 5.0
        got = submission.one_step(Ad, Bd, x, u)
        self.assertAlmostEqual(
            got[0], x[0] + dt * x[1], delta=1e-12,
            msg="expected the matrix step to reproduce x + Ts v = 0.1035; another value likely "
                "lost the off-diagonal 1 - check Ad's top-right entry is dt",
        )
        self.assertAlmostEqual(
            got[1], x[1] + dt * ((-k * x[0] - b * x[1] + u) / m), delta=1e-12,
            msg="expected the velocity row to match the scalar Euler update, 0.0305; a mismatch "
                "likely divided the force by the wrong mass or dropped b - check (u - kx - bv)/m",
        )

    def test_converges_to_static_equilibrium(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        final = submission.simulate(Ad, Bd, [0.10, 0.0], 5.0, 500)
        self.assertAlmostEqual(
            final[0], 0.05, delta=1e-3,
            msg="expected the cart to settle at u/k = 0.05 m after 500 steps; 0.10 likely never "
                "moved, 0.0 likely overshot - check the spring pulls toward equilibrium",
        )
        self.assertAlmostEqual(
            final[1], 0.0, delta=1e-4,
            msg="expected the velocity to die out at equilibrium; a residual speed likely means "
                "the damping term was dropped from Ad",
        )

    def test_simulate_is_the_repeated_step(self):
        Ad, Bd = submission.state_matrices(2.0, 50.0, 4.0, 0.002)
        x = [0.0, 0.0]
        for _ in range(7):
            x = submission.one_step(Ad, Bd, x, 3.0)
        got = submission.simulate(Ad, Bd, [0.0, 0.0], 3.0, 7)
        for expected, value in zip(x, got):
            self.assertAlmostEqual(
                value, expected, delta=1e-12,
                msg="expected simulate to be one_step applied seven times; a mismatch likely "
                    "ran one step too few or reused the initial state - check the loop count",
            )

    def test_refuses_negative_steps(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        with self.assertRaises(ValueError):
            submission.simulate(Ad, Bd, [0.0, 0.0], 0.0, -1)


class PlantTests(unittest.TestCase):
    def test_state_matrices_use_every_parameter(self):
        slow, _ = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        fast, fast_b = submission.state_matrices(2.0, 50.0, 4.0, 0.002)
        self.assertAlmostEqual(
            slow[0][1], 0.01, delta=1e-12,
            msg="expected Ad[0][1] = dt = 0.01 for the slow case; 0.1 likely read the mass - "
                "check the position row is [1, dt]",
        )
        self.assertAlmostEqual(
            fast[0][1], 0.002, delta=1e-12,
            msg="expected the second call's own 0.002 step in Ad[0][1]; 0.01 likely reused a "
                "remembered dt - check the step is an argument",
        )
        self.assertAlmostEqual(
            fast[1][0], -0.05, delta=1e-12,
            msg="expected -(k/m) dt = -(50/2)(0.002) = -0.05; -0.1 likely forgot the dt or used "
                "the first mass - check the entry is built from this call's m and k",
        )
        self.assertAlmostEqual(
            fast[1][1], 1.0 - 0.004, delta=1e-12,
            msg="expected 1 - (b/m) dt = 1 - (4/2)(0.002) = 0.996; 0.96 belongs to the first "
                "call, which means m, b and dt were not all updated",
        )
        self.assertAlmostEqual(
            fast_b[1], 0.001, delta=1e-12,
            msg="expected dt/m = 0.002/2 = 0.001 in the input row; 0.01 likely divided by the "
                "first mass or dropped dt - check Bd is rebuilt per call",
        )

    def test_refuses_a_zero_mass(self):
        with self.assertRaises(ValueError):
            submission.state_matrices(0.0, 100.0, 10.0, 0.01)


class TwoMassTests(unittest.TestCase):
    def test_uncoupled_blocks_reduce_to_the_two_state_matrices(self):
        Ad, Bd = submission.two_mass_matrices(1.0, 4.0, 0.0, 0.0, 0.01)
        first, first_b = submission.state_matrices(1.0, 0.0, 0.0, 0.01)
        second, _ = submission.state_matrices(4.0, 0.0, 0.0, 0.01)
        self.assertEqual(
            [row[:2] for row in Ad[:2]], first,
            msg="expected the first mass's block to equal the 2-state matrix with k = b = 0; "
                "another block likely kept the coupling terms with zero stiffness",
        )
        self.assertEqual(
            [row[2:] for row in Ad[2:]], second,
            msg="expected the second mass's block to equal its own 2-state matrix; a mismatch "
                "likely used the first mass's dt or inertia",
        )
        self.assertEqual(
            Bd, [first_b[0], first_b[1], 0.0, 0.0],
            msg="expected the force to enter only the first mass's velocity row; a nonzero "
                "load entry likely split the input across both masses",
        )

    def test_coupling_eventually_drags_the_second_mass_along(self):
        Ad, Bd = submission.two_mass_matrices(1.0, 2.0, 50.0, 3.0, 0.001)
        final = submission.simulate(Ad, Bd, [0.0, 0.0, 0.0, 0.0], 1.0, 6000)
        self.assertAlmostEqual(
            final[0], final[2], delta=2e-2,
            msg="expected the stiff shaft to bring both masses to the same position after 6 s; "
                "a gap likely means the off-diagonal coupling is missing - check the 4x4 terms",
        )
        self.assertGreater(
            final[0], 1e-2,
            msg="expected the driven mass to move a visible distance; a near-zero position "
                "likely means the force never reached the matrix - check Bd",
        )


class TraceTests(unittest.TestCase):
    def test_trace_starts_at_the_initial_position(self):
        Ad, Bd = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        trace = submission.position_trace(Ad, Bd, [0.10, 0.0], 5.0, 4)
        self.assertEqual(
            len(trace), 5,
            msg="expected steps + 1 samples so the trace begins at the initial state; 4 likely "
                "recorded only after stepping - check the trace starts at x0",
        )
        self.assertAlmostEqual(
            trace[0], 0.10, delta=1e-12,
            msg="expected the first sample to be the initial position 0.10; another value likely "
                "stepped before recording - check the order of append and update",
        )
        # Position only moves once velocity is non-zero: step 1 still reads 0.10.
        self.assertAlmostEqual(
            trace[1], 0.10, delta=1e-12,
            msg="expected the position to stay 0.10 after one step, since velocity starts at "
                "zero; 0.1005 likely used the newly computed velocity in the same step",
        )
        # v1 = -1.0*0.10 + 0.01*5.0 = -0.05, so x2 = 0.10 + 0.01*(-0.05).
        self.assertAlmostEqual(
            trace[2], 0.0995, delta=1e-12,
            msg="expected the second sample at 0.0995 m after the new velocity of -0.05; 0.099 "
                "likely dropped the half - check the step ordering",
        )


if __name__ == "__main__":
    unittest.main()
