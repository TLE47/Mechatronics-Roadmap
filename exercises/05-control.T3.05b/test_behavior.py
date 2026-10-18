"""Behaviour tests for 05-control.T3.05b.

Each test names the mistake it catches:
  * a rotation built with the wrong sign, which corrects the attitude in the opposite direction;
  * a Rodrigues expansion that drops the K^2 term and calls the result a rotation;
  * an injection multiplied on the left, so a small body-frame correction is applied in the world
    frame instead;
  * an update that never resets the error-state mean, so the correction it just consumed is
    injected again on the very next step - the module's second Common-mistakes row.
"""

import math
import unittest

import harness

submission = harness.load_submission()

IDENTITY = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


class RotationTests(unittest.TestCase):
    def test_the_worked_rotation(self):
        # A 0.05 rad correction about +z: [[cos, -sin, 0], [sin, cos, 0], [0, 0, 1]].
        rotation = submission.exp_so3([0.0, 0.0, 0.05])
        self.assertAlmostEqual(
            rotation[0][0], math.cos(0.05), delta=1e-15,
            msg="expected the (0, 0) entry to be cos(0.05), since the K^2 term puts the cosine "
                "on the diagonal; 1.0 means the square term was dropped - check the expansion",
        )
        self.assertAlmostEqual(
            rotation[0][1], -math.sin(0.05), delta=1e-15,
            msg="expected the upper off-diagonal to carry -sin(0.05), the sign that makes a "
                "positive correction turn the body the right way; +sin means the sign is flipped",
        )
        self.assertAlmostEqual(
            rotation[1][0], math.sin(0.05), delta=1e-15,
            msg="expected the lower off-diagonal to be +sin(0.05), the antisymmetric partner; "
                "a flipped pair means the rotation runs backwards - check the sign convention",
        )
        self.assertAlmostEqual(
            rotation[1][1], math.cos(0.05), delta=1e-15,
            msg="expected the (1, 1) entry to be cos(0.05) as well; 1.0 means the second-order "
                "term is missing and the matrix is not orthogonal",
        )
        self.assertAlmostEqual(
            rotation[2][2], 1.0, delta=1e-15,
            msg="expected the z axis to stay fixed under a rotation about z; a value away from 1 "
                "means the axis was misread - check which component carries the angle",
        )

    def test_a_correction_about_x_rotates_y_into_z(self):
        # The K^2 term is what puts cos(0.10) on the diagonal; dropping it leaves 1.0 there.
        rotation = submission.exp_so3([0.10, 0.0, 0.0])
        self.assertAlmostEqual(
            rotation[1][1], math.cos(0.10), delta=1e-15,
            msg="expected a rotation about x to put cos(0.10) in the y-y slot; 1.0 means only "
                "the first-order term was expanded - check K^2",
        )
        self.assertAlmostEqual(
            rotation[1][2], -math.sin(0.10), delta=1e-15,
            msg="expected the y-z entry to be -sin(0.10), which is what turns y toward z; a "
                "zero or positive value means the axis mapping is wrong - check the Levi-Civita "
                "signs",
        )
        self.assertAlmostEqual(
            rotation[2][1], math.sin(0.10), delta=1e-15,
            msg="expected the mirrored entry to be +sin(0.10), keeping the matrix antisymmetric "
                "in its off-diagonal pair; a mismatch means the two signs were applied together",
        )

    def test_the_injection_preserves_the_special_orthogonal_group(self):
        nominal = submission.exp_so3([0.3, -0.2, 0.1])
        moved = submission.inject_rotation(nominal, [0.0, 0.0, 0.05])
        determinant = (
            moved[0][0] * (moved[1][1] * moved[2][2] - moved[1][2] * moved[2][1])
            - moved[0][1] * (moved[1][0] * moved[2][2] - moved[1][2] * moved[2][0])
            + moved[0][2] * (moved[1][0] * moved[2][1] - moved[1][1] * moved[2][0])
        )
        self.assertAlmostEqual(
            determinant, 1.0, delta=1e-12,
            msg="expected the injected matrix to stay a proper rotation with determinant +1; a "
                "value near -1 means a reflection slipped in, and 1 + O(eps) means a first-order "
                "approximation was used - check the product of two exponentials",
        )
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    sum(moved[i][k] * moved[j][k] for k in range(3)),
                    1.0 if i == j else 0.0, delta=1e-12,
                    msg="expected every row pair to be orthonormal after the injection, so R^T R "
                        "stays the identity; a residual means the result is not a rotation at "
                        "all - check both factors are exponentials",
                )

    def test_the_injection_is_a_right_multiplication(self):
        # The correction is a body-frame step: exp([d]/2) R exp([d]/2) is not the same rotation,
        # so a left multiplication fails here even though it is still orthogonal.
        nominal = [[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]]
        moved = submission.inject_rotation(nominal, [0.0, 0.0, 0.05])
        expected = matmul(nominal, submission.exp_so3([0.0, 0.0, 0.05]))
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    moved[i][j], expected[i][j], delta=1e-15,
                    msg="expected the injection to multiply on the right, R exp([d]), so a "
                        "body-frame correction turns the body rather than the world; a mismatch "
                        "at this turned nominal frame means the order was swapped - check which "
                        "side the exponential sits on",
                )

    def test_injecting_zero_returns_the_nominal_rotation(self):
        nominal = [[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]]
        moved = submission.inject_rotation(nominal, [0.0, 0.0, 0.0])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    moved[i][j], nominal[i][j], delta=1e-15,
                    msg="expected a zero correction to leave the nominal rotation untouched; a "
                        "changed entry means the exponential of zero is not the identity - check "
                        "the zero-length short circuit",
                )

    def test_two_small_injections_add_up(self):
        one = submission.inject_rotation(submission.exp_so3([0.0, 0.0, 0.02]),
                                         [0.0, 0.0, 0.03])
        two = submission.exp_so3([0.0, 0.0, 0.05])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    one[i][j], two[i][j], delta=1e-15,
                    msg="expected two small rotations about the same axis to compose into their "
                        "sum, 0.02 + 0.03 = 0.05 rad; a mismatch means the composition lost an "
                        "order - check the multiplication order is right-handed",
                )

    def test_a_two_component_correction_is_refused(self):
        with self.assertRaises(ValueError):
            submission.exp_so3([0.0, 0.05])
        with self.assertRaises(ValueError):
            submission.inject_rotation([[1.0, 0.0], [0.0, 1.0]], [0.0, 0.0, 0.05])


class ResetTests(unittest.TestCase):
    def test_a_zero_innovation_step_does_not_reapply_the_consumed_correction(self):
        # One 0.05 rad update, then a measurement that asks for nothing. A filter that forgot the
        # reset still holds 0.05 rad in its mean and turns another 0.05: 0.10 rad, not 0.05.
        held = submission.eskf_rotation_update(IDENTITY, [0.0, 0.0, 0.05], [0.0, 0.0, 0.0])
        expected = submission.exp_so3([0.0, 0.0, 0.05])
        stale = submission.inject_rotation(submission.inject_rotation(
            IDENTITY, [0.0, 0.0, 0.05]), [0.0, 0.0, 0.05])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    held[i][j], expected[i][j], delta=1e-15,
                    msg="expected a zero innovation after the first update to hold the 0.05 rad "
                        "turn exactly; a different matrix means the consumed correction is still "
                        "sitting in the error-state mean - check the reset",
                )
        self.assertAlmostEqual(
            held[1][0], math.sin(0.05), delta=1e-15,
            msg="expected the held rotation to read sin(0.05) below the diagonal, one count of "
                "correction delivered once; a larger value means the update was applied twice",
        )
        self.assertAlmostEqual(
            stale[1][0], math.sin(0.10), delta=1e-15,
            msg="expected the no-reset variant to reach sin(0.10), the 0.10 rad the module's "
                "Common-mistakes row describes; a smaller value means the test cannot tell the "
                "two filters apart",
        )
        self.assertNotAlmostEqual(
            held[1][0], stale[1][0], delta=1e-6,
            msg="expected the resetting filter and the stale one to differ visibly at this angle, "
                "which is the whole point of the test; equality means both code paths do the same "
                "thing - check the error-state mean is cleared",
        )

    def test_a_real_next_innovation_is_applied(self):
        # Reset to zero, then a real 0.02 rad innovation: 0.05 + 0.02 = 0.07, not 0.05 and not 0.12.
        stepped = submission.eskf_rotation_update(IDENTITY, [0.0, 0.0, 0.05], [0.0, 0.0, 0.02])
        expected = submission.exp_so3([0.0, 0.0, 0.07])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    stepped[i][j], expected[i][j], delta=1e-15,
                    msg="expected the second update to add its real 0.02 rad innovation to the "
                        "0.05 already taken, giving 0.07; 0.05 means the new measurement was "
                        "dropped, 0.12 means the old one was re-injected as well",
                )

    def test_a_zero_update_changes_nothing(self):
        moved = submission.eskf_rotation_update(IDENTITY, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    moved[i][j], IDENTITY[i][j], delta=1e-15,
                    msg="expected a zero correction and zero innovation to leave the identity "
                        "alone; any other entry means the update invents motion from nothing - "
                        "check the zero path",
                )

    def test_the_reset_keeps_the_previous_rotation(self):
        # Starting from an already-turned frame, the reset holds *that* frame plus one correction.
        nominal = submission.exp_so3([0.0, 0.0, 0.20])
        held = submission.eskf_rotation_update(nominal, [0.0, 0.0, 0.05], [0.0, 0.0, 0.0])
        expected = submission.exp_so3([0.0, 0.0, 0.25])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    held[i][j], expected[i][j], delta=1e-15,
                    msg="expected the update to keep the nominal 0.20 rad frame and add its one "
                        "correction, ending at 0.25; 0.20 means the correction was dropped and "
                        "0.30 means the nominal was double-counted - check what the reset resets",
                )


if __name__ == "__main__":
    unittest.main()
