"""Behaviour tests for 00-foundations.T2.00e.

Each test names the mistake it catches:
  * a companion matrix with the wrong sign on the stiffness term (an unstable spring);
  * eigenvalues computed from the physical J, k, b instead of the matrix's entries;
  * `is_stable` reading the trace only - a saddle with a negative trace is still unstable;
  * Euler written as I - A Ts (a stable pole that comes back out of the unit circle mirrored);
  * Tustin with a term-by-term division instead of a matrix inverse;
  * a discrete loop that does not update both states from the same old state.
"""

import cmath
import math
import unittest

import harness

submission = harness.load_submission()


def close(a, b, delta=1e-12):
    return abs(a - b) <= delta


class CompanionTests(unittest.TestCase):
    def test_worked_matrices(self):
        a, b = submission.companion_state_matrices(1.0, 100.0, 4.0)
        self.assertEqual(a[0], [0.0, 1.0])
        self.assertEqual(a[1], [-100.0, -4.0])
        self.assertEqual(b, [[0.0], [1.0]])

    def test_uses_every_parameter(self):
        a, b = submission.companion_state_matrices(2.0, 50.0, 6.0)
        self.assertAlmostEqual(a[1][0], -25.0, delta=1e-12)
        self.assertAlmostEqual(a[1][1], -3.0, delta=1e-12)
        self.assertAlmostEqual(b[1][0], 0.5, delta=1e-12)


class EigenTests(unittest.TestCase):
    def test_underdamped_pair(self):
        l1, l2 = submission.eigvals_2x2([[0.0, 1.0], [-100.0, -4.0]])
        self.assertAlmostEqual(l1.real, -2.0, delta=1e-12)
        self.assertAlmostEqual(l2.real, -2.0, delta=1e-12)
        self.assertAlmostEqual(abs(l1.imag), math.sqrt(96.0), delta=1e-9)
        self.assertAlmostEqual(l1.imag, -l2.imag, delta=1e-9)

    def test_trace_and_determinant(self):
        a = [[-1.5, 2.0], [-3.0, -4.5]]
        l1, l2 = submission.eigvals_2x2(a)
        self.assertAlmostEqual(l1 + l2, complex(-6.0, 0.0), delta=1e-12)
        self.assertAlmostEqual(l1 * l2, complex(12.75, 0.0), delta=1e-12)

    def test_real_poles_for_an_overdamped_system(self):
        l1, l2 = submission.eigvals_2x2([[0.0, 1.0], [-100.0, -25.0]])
        self.assertAlmostEqual(l1.imag, 0.0, delta=1e-12)
        self.assertAlmostEqual(l2.imag, 0.0, delta=1e-12)


class StabilityTests(unittest.TestCase):
    def test_stable_and_unstable(self):
        self.assertTrue(submission.is_stable([[0.0, 1.0], [-100.0, -4.0]]))
        self.assertFalse(submission.is_stable([[0.0, 1.0], [100.0, -4.0]]))
        self.assertFalse(submission.is_stable([[0.0, 1.0], [-100.0, 4.0]]))

    def test_a_saddle_is_not_stable(self):
        # trace negative, determinant negative: one pole is positive even though the trace is not.
        self.assertFalse(submission.is_stable([[-3.0, 0.0], [0.0, 1.0]]))

    def test_marginal_is_not_stable(self):
        self.assertFalse(submission.is_stable([[0.0, 1.0], [-4.0, 0.0]]))


class DiscretisationTests(unittest.TestCase):
    def test_euler_is_identity_plus_a_ts(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        ad, bd = submission.discretize_euler(a, b, 0.01)
        self.assertAlmostEqual(ad[0][0], 1.0, delta=1e-12)
        self.assertAlmostEqual(ad[0][1], 0.01, delta=1e-12)
        self.assertAlmostEqual(ad[1][0], -1.0, delta=1e-12)
        self.assertAlmostEqual(ad[1][1], 1.0 - 0.04, delta=1e-12)
        self.assertAlmostEqual(bd[1][0], 0.01, delta=1e-12)

    def test_tustin_keeps_stable_poles_inside_the_unit_circle(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        for ts in (0.001, 0.05, 0.2):
            ad, _ = submission.discretize_tustin(a, b, ts)
            for value in submission.eigvals_2x2(ad):
                self.assertLess(abs(value), 1.0 + 1e-12, "Tustin pole left the unit circle at Ts=%g" % ts)

    def test_euler_leaves_the_unit_circle_where_tustin_does_not(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        euler, _ = submission.discretize_euler(a, b, 0.2)
        tustin, _ = submission.discretize_tustin(a, b, 0.2)
        self.assertTrue(any(abs(v) > 1.0 for v in submission.eigvals_2x2(euler)))
        self.assertTrue(all(abs(v) < 1.0 for v in submission.eigvals_2x2(tustin)))

    def test_tustin_bd_matches_the_map(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        ts = 0.01
        ad, bd = submission.discretize_tustin(a, b, ts)
        # For a unit step held one sample, the state after one step is B_hat = (I - Ts/2 A)^-1 B Ts.
        minus = [[1.0, -0.5 * ts], [0.5 * ts * 100.0, 1.0 + 0.5 * ts * 4.0]]
        det = minus[0][0] * minus[1][1] - minus[0][1] * minus[1][0]
        expected0 = (-minus[0][1] / det) * ts
        expected1 = (minus[0][0] / det) * ts
        self.assertAlmostEqual(bd[0][0], expected0, delta=1e-12)
        self.assertAlmostEqual(bd[1][0], expected1, delta=1e-12)


class SimulationTests(unittest.TestCase):
    def test_one_step_matches_the_matrix(self):
        a = [[0.0, 1.0], [-4.0, -1.0]]
        b = [[0.0], [1.0]]
        ad, bd = submission.discretize_euler(a, b, 0.1)
        x0 = [0.5, -0.2]
        final = submission.simulate_discrete(ad, bd, x0, 2.0, 1)
        self.assertAlmostEqual(final[0], 0.5 + 0.1 * (-0.2), delta=1e-12)
        self.assertAlmostEqual(final[1], -0.2 + 0.1 * (-4.0 * 0.5 - 1.0 * (-0.2) + 2.0), delta=1e-12)

    def test_uses_the_old_state_for_both_rows(self):
        ad = [[1.0, 0.1], [0.0, 0.9]]
        bd = [[0.0], [0.0]]
        final = submission.simulate_discrete(ad, bd, [0.0, 1.0], 0.0, 1)
        self.assertAlmostEqual(final[0], 0.1, delta=1e-12)
        self.assertAlmostEqual(final[1], 0.9, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
