"""Transfer tests for 00-foundations.T2.00e - the arm's elbow as a state-space model.

The eigenvalues of the companion matrix must equal the poles `zeta` and `wn` predict, with the
plant's own damping counted; and the discretisation must keep those poles where they belong at a
step size a controller would actually use.
"""

import cmath
import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class ElbowStateSpaceTests(unittest.TestCase):
    def test_poles_match_the_second_order_prediction(self):
        j, k = plant.I2, 8.0
        b = plant.B2
        wn = math.sqrt(k / j)
        zeta = b / (2.0 * math.sqrt(j * k))
        expected = complex(-zeta * wn, wn * math.sqrt(1.0 - zeta * zeta))
        a, bvec = submission.companion_state_matrices(j, k, b)
        self.assertAlmostEqual(
            bvec[1][0], 1.0 / j, delta=1e-12,
            msg="expected the input row to be 1/J for the plant's elbow inertia; a value equal "
                "to J likely multiplied instead of dividing - check 1 / j",
        )
        poles = sorted(submission.eigvals_2x2(a), key=lambda v: v.imag)
        self.assertAlmostEqual(
            poles[0].real, expected.real, delta=1e-9,
            msg="expected the matrix's pole to carry the same real part as -zeta wn from the "
                "plant's own damping; a mismatch likely used a nominal zeta - check B2",
        )
        self.assertAlmostEqual(
            abs(poles[0].imag), abs(expected.imag), delta=1e-9,
            msg="expected the damped natural frequency wn sqrt(1 - zeta^2) from the matrix; a "
                "value equal to wn likely dropped the damping factor",
        )
        self.assertTrue(
            submission.is_stable(a),
            msg="expected the elbow's companion matrix to be stable, since both poles lie left; "
                "False likely reversed the sign of the stiffness entry",
        )

    def test_tustin_and_euler_disagree_at_a_control_step(self):
        j, k = plant.I2, 8.0
        a, b = submission.companion_state_matrices(j, k, plant.B2)
        ts = 0.001
        ad_tustin, _ = submission.discretize_tustin(a, b, ts)
        ad_euler, _ = submission.discretize_euler(a, b, ts)
        self.assertTrue(
            all(abs(v) < 1.0 for v in submission.eigvals_2x2(ad_tustin)),
            msg="expected every Tustin pole to stay inside the unit circle at the 1 ms control "
                "step; a pole outside likely divided the entries without the matrix inverse",
        )
        self.assertTrue(
            all(abs(v) < 1.0 for v in submission.eigvals_2x2(ad_euler)),
            msg="expected Euler to be fine at a 1 ms step, where Ts w is small; a pole outside "
                "means the step was applied with the wrong sign",
        )
        # At a step size a slow loop might use, Euler's poles cross the circle and Tustin's do not.
        coarse = 0.4
        ad_tustin, _ = submission.discretize_tustin(a, b, coarse)
        ad_euler, _ = submission.discretize_euler(a, b, coarse)
        self.assertTrue(
            all(abs(v) < 1.0 for v in submission.eigvals_2x2(ad_tustin)),
            msg="expected Tustin to survive a 0.4 s step, since it maps the stable half-plane "
                "into the circle at any size; a pole outside likely used the wrong matrix",
        )
        self.assertTrue(
            any(abs(v) > 1.0 for v in submission.eigvals_2x2(ad_euler)),
            msg="expected Euler at 0.4 s to throw a pole outside the circle, the instability "
                "the module demonstrates; all inside likely clamped or rescaled Ts",
        )


if __name__ == "__main__":
    unittest.main()
