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
        self.assertEqual(
            a[0], [0.0, 1.0],
            msg="expected the first row [0, 1] so the state is [angle, rate]; another row "
                "likely put the stiffness on top - check the companion form",
        )
        self.assertEqual(
            a[1], [-100.0, -4.0],
            msg="expected the second row [-k/J, -b/J] = [-100, -4]; +100 likely lost the minus "
                "on the spring, which would be an unstable plant",
        )
        self.assertEqual(
            b, [[0.0], [1.0]],
            msg="expected the torque to enter the rate row only, B = [0, 1/J] with J = 1; a "
                "nonzero top entry likely spread the input across both states",
        )

    def test_uses_every_parameter(self):
        a, b = submission.companion_state_matrices(2.0, 50.0, 6.0)
        self.assertAlmostEqual(
            a[1][0], -25.0, delta=1e-12,
            msg="expected -50/2 = -25 for the stiffness term; -50 likely ignored J, -0.04 "
                "likely inverted the ratio - check -k / j",
        )
        self.assertAlmostEqual(
            a[1][1], -3.0, delta=1e-12,
            msg="expected -6/2 = -3 for the damping term; -6 likely ignored J - check -b / j",
        )
        self.assertAlmostEqual(
            b[1][0], 0.5, delta=1e-12,
            msg="expected 1/2 = 0.5 in the input row; 2.0 likely multiplied by J instead of "
                "dividing - check 1 / j",
        )


class EigenTests(unittest.TestCase):
    def test_underdamped_pair(self):
        l1, l2 = submission.eigvals_2x2([[0.0, 1.0], [-100.0, -4.0]])
        self.assertAlmostEqual(
            l1.real, -2.0, delta=1e-12,
            msg="expected a real part of -b/2J = -2; -4 likely returned the trace itself - "
                "check the half in (tr +/- sqrt(tr^2 - 4det)) / 2",
        )
        self.assertAlmostEqual(
            l2.real, -2.0, delta=1e-12,
            msg="expected the conjugate pole to share the -2 real part; a mismatch likely "
                "subtracted the discriminant before halving - check both roots",
        )
        self.assertAlmostEqual(
            abs(l1.imag), math.sqrt(96.0), delta=1e-9,
            msg="expected |Im| = sqrt(100 - 4) = 9.798 rad/s; 10 likely ignored the damping "
                "inside the discriminant - check sqrt(4 det - tr^2)/2",
        )
        self.assertAlmostEqual(
            l1.imag, -l2.imag, delta=1e-9,
            msg="expected the two imaginary parts to be exact conjugates; equal signs likely "
                "added the discriminant twice - check the +/- branch",
        )

    def test_trace_and_determinant(self):
        a = [[-1.5, 2.0], [-3.0, -4.5]]
        l1, l2 = submission.eigvals_2x2(a)
        self.assertAlmostEqual(
            l1 + l2, complex(-6.0, 0.0), delta=1e-12,
            msg="expected the poles to sum to the trace -6; another sum likely read the "
                "determinant as the trace - check a11 + a22",
        )
        self.assertAlmostEqual(
            l1 * l2, complex(12.75, 0.0), delta=1e-12,
            msg="expected the poles to multiply to the determinant (-1.5)(-4.5) - (2)(-3) = "
                "12.75; 6.75 likely used the wrong off-diagonal sign - check ad - bc",
        )

    def test_real_poles_for_an_overdamped_system(self):
        l1, l2 = submission.eigvals_2x2([[0.0, 1.0], [-100.0, -25.0]])
        self.assertAlmostEqual(
            l1.imag, 0.0, delta=1e-12,
            msg="expected a positive discriminant here, so a real first pole; a nonzero "
                "imaginary part likely clamped the discriminant - check tr^2 > 4 det",
        )
        self.assertAlmostEqual(
            l2.imag, 0.0, delta=1e-12,
            msg="expected the second pole to be real too; an imaginary part likely used abs() "
                "on the discriminant and always took a square root - check the sign first",
        )


class StabilityTests(unittest.TestCase):
    def test_stable_and_unstable(self):
        self.assertTrue(
            submission.is_stable([[0.0, 1.0], [-100.0, -4.0]]),
            msg="expected both poles at -2 +/- j9.8 to be stable; False likely demanded real "
                "poles or a positive determinant only - check every real part is negative",
        )
        self.assertFalse(
            submission.is_stable([[0.0, 1.0], [100.0, -4.0]]),
            msg="expected +100 in the stiffness entry to be an unstable spring; True likely "
                "looked only at the negative trace - check the poles themselves",
        )
        self.assertFalse(
            submission.is_stable([[0.0, 1.0], [-100.0, 4.0]]),
            msg="expected +4 damping to drive the system unstable; True likely trusted the "
                "negative determinant - check a positive real part exists",
        )

    def test_a_saddle_is_not_stable(self):
        # trace negative, determinant negative: one pole is positive even though the trace is not.
        self.assertFalse(
            submission.is_stable([[-3.0, 0.0], [0.0, 1.0]]),
            msg="expected the saddle at -3 and +1 to be unstable despite its negative trace; "
                "True means is_stable only read the trace - check both eigenvalues",
        )

    def test_marginal_is_not_stable(self):
        self.assertFalse(
            submission.is_stable([[0.0, 1.0], [-4.0, 0.0]]),
            msg="expected poles on the imaginary axis to count as not stable, since a margin "
                "is not decay; True likely accepted a zero real part - check the test is strict",
        )


class DiscretisationTests(unittest.TestCase):
    def test_euler_is_identity_plus_a_ts(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        ad, bd = submission.discretize_euler(a, b, 0.01)
        self.assertAlmostEqual(
            ad[0][0], 1.0, delta=1e-12,
            msg="expected the diagonal to keep its 1 from the identity; 1.01 likely added Ts "
                "to the diagonal - check I + Ts A",
        )
        self.assertAlmostEqual(
            ad[0][1], 0.01, delta=1e-12,
            msg="expected the (0,1) entry to be Ts = 0.01; 1.01 or 0.0 likely misplaced the "
                "identity term - check Ts multiplies A",
        )
        self.assertAlmostEqual(
            ad[1][0], -1.0, delta=1e-12,
            msg="expected -100 * 0.01 = -1.0 in the stiffness entry; +1.0 likely dropped the "
                "matrix's minus sign - check Ts A keeps the sign",
        )
        self.assertAlmostEqual(
            ad[1][1], 1.0 - 0.04, delta=1e-12,
            msg="expected 1 - 4 * 0.01 = 0.96 on the damping diagonal; 1.04 likely used plus "
                "instead of minus, which mirrors the pole across the circle - check I + Ts A",
        )
        self.assertAlmostEqual(
            bd[1][0], 0.01, delta=1e-12,
            msg="expected Ts * B = 0.01 in the input row; 1.0 likely forgot Ts - check the "
                "input is scaled by the step",
        )

    def test_tustin_keeps_stable_poles_inside_the_unit_circle(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        for ts in (0.001, 0.05, 0.2):
            ad, _ = submission.discretize_tustin(a, b, ts)
            for value in submission.eigvals_2x2(ad):
                self.assertLess(
                    abs(value), 1.0 + 1e-12,
                    msg="expected every Tustin pole to stay inside the unit circle at each step "
                        "size in this loop; a pole outside means the transform was applied "
                        "term-by-term without the matrix inverse",
                )

    def test_euler_leaves_the_unit_circle_where_tustin_does_not(self):
        a = [[0.0, 1.0], [-100.0, -4.0]]
        b = [[0.0], [1.0]]
        euler, _ = submission.discretize_euler(a, b, 0.2)
        tustin, _ = submission.discretize_tustin(a, b, 0.2)
        self.assertTrue(
            any(abs(v) > 1.0 for v in submission.eigvals_2x2(euler)),
            msg="expected Euler at a 0.2 s step to push a pole outside the unit circle, which "
                "is the instability the module warns about; all inside likely means Ts was "
                "ignored",
        )
        self.assertTrue(
            all(abs(v) < 1.0 for v in submission.eigvals_2x2(tustin)),
            msg="expected Tustin to keep every pole inside at the same coarse step; a pole "
                "outside likely divides each entry instead of inverting the matrix",
        )

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
        self.assertAlmostEqual(
            bd[0][0], expected0, delta=1e-12,
            msg="expected the first input row to be -(I - Ts/2 A)^-1[0,1] * Ts; a mismatch "
                "likely divided B by the diagonal only - check the matrix inverse",
        )
        self.assertAlmostEqual(
            bd[1][0], expected1, delta=1e-12,
            msg="expected the second input row to be (I - Ts/2 A)^-1[1,0] * Ts; another value "
                "likely applied the inverse without the Ts factor - check the step scaling",
        )


class SimulationTests(unittest.TestCase):
    def test_one_step_matches_the_matrix(self):
        a = [[0.0, 1.0], [-4.0, -1.0]]
        b = [[0.0], [1.0]]
        ad, bd = submission.discretize_euler(a, b, 0.1)
        x0 = [0.5, -0.2]
        final = submission.simulate_discrete(ad, bd, x0, 2.0, 1)
        self.assertAlmostEqual(
            final[0], 0.5 + 0.1 * (-0.2), delta=1e-12,
            msg="expected the angle to advance by Ts times the old rate, 0.48; 0.5 likely "
                "ignored the off-diagonal - check x0 + Ts x1",
        )
        self.assertAlmostEqual(
            final[1], -0.2 + 0.1 * (-4.0 * 0.5 - 1.0 * (-0.2) + 2.0), delta=1e-12,
            msg="expected the rate update to use both old states plus the torque, 0.12; another "
                "value likely fed the new angle back into the same step",
        )

    def test_uses_the_old_state_for_both_rows(self):
        ad = [[1.0, 0.1], [0.0, 0.9]]
        bd = [[0.0], [0.0]]
        final = submission.simulate_discrete(ad, bd, [0.0, 1.0], 0.0, 1)
        self.assertAlmostEqual(
            final[0], 0.1, delta=1e-12,
            msg="expected the first row to read the old rate of 1.0 and give 0.1; 0.09 likely "
                "used the already-updated rate - check both rows read x0",
        )
        self.assertAlmostEqual(
            final[1], 0.9, delta=1e-12,
            msg="expected the second row to decay the rate to 0.9; 0.09 likely mixed the rows "
                "- check each output uses the same old vector",
        )


if __name__ == "__main__":
    unittest.main()
