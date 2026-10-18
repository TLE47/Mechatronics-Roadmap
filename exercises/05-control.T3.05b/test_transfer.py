"""Transfer tests for 05-control.T3.05b - the same injection on the plant's own encoder.

Three claims, measured on the shared arm:
  1. one encoder count (2 pi / 4096) is a tangent-space step whose exp() is a genuine rotation:
     determinant 1 and R^T R = I to 1e-15;
  2. injecting that one count into the identity turns the body by exactly one count, read back
     from the trace - acos loses a couple of ulp at this angle, so the count is pinned to 1e-12;
  3. the ESKF update does not swallow the correction: with a zero innovation it holds the one
     count, which is what a filter that resets its error-state mean is supposed to do.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

ONE_COUNT = 2.0 * math.pi / plant.ENCODER_CPR
IDENTITY = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


class EncoderTangentSpaceTests(unittest.TestCase):
    def test_one_encoder_count_is_a_tangent_space_step(self):
        self.assertAlmostEqual(
            ONE_COUNT, 0.0015339807878856412, delta=1e-18,
            msg="expected one AS5600 count to be 1.53398e-3 rad, 2 pi over 4096; a value near "
                "3.835e-4 means 16384 was used - check the plant's encoder count",
        )
        rotation = submission.exp_so3([0.0, 0.0, ONE_COUNT])
        determinant = (
            rotation[0][0] * (rotation[1][1] * rotation[2][2] - rotation[1][2] * rotation[2][1])
            - rotation[0][1] * (rotation[1][0] * rotation[2][2] - rotation[1][2] * rotation[2][0])
            + rotation[0][2] * (rotation[1][0] * rotation[2][1] - rotation[1][1] * rotation[2][0])
        )
        self.assertAlmostEqual(
            determinant, 1.0, delta=1e-15,
            msg="expected the one-count exponential to be a proper rotation with determinant +1; "
                "a deviation means the K^2 term was dropped and the matrix is not orthogonal",
        )
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    sum(rotation[i][k] * rotation[j][k] for k in range(3)),
                    1.0 if i == j else 0.0, delta=1e-15,
                    msg="expected every row pair of the one-count exponential to be orthonormal to "
                        "machine precision; a residual means the tangent-space step leaked a "
                        "first-order approximation into the rotation - check the series",
                )

    def test_the_angle_actually_injected_is_one_count(self):
        rotation = submission.inject_rotation(IDENTITY, [0.0, 0.0, ONE_COUNT])
        trace = rotation[0][0] + rotation[1][1] + rotation[2][2]
        self.assertAlmostEqual(
            math.acos(max(-1.0, min(1.0, (trace - 1.0) / 2.0))), ONE_COUNT, delta=1e-12,
            msg="expected the trace readback to give exactly one encoder count back, 1.53398e-3 "
                "rad; a larger angle means the injection applied the correction twice - check "
                "the matrix product",
        )

    def test_the_reset_does_not_swallow_the_correction(self):
        # A zero innovation after the injection must leave the one-count rotation in place.
        held = submission.eskf_rotation_update(IDENTITY, [0.0, 0.0, ONE_COUNT], [0.0, 0.0, 0.0])
        expected = submission.exp_so3([0.0, 0.0, ONE_COUNT])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    held[i][j], expected[i][j], delta=1e-15,
                    msg="expected the update to hold the one-count rotation when the next "
                        "innovation is zero; a mismatch means the correction was discarded with "
                        "the reset, so the filter would track nothing at all",
                )


if __name__ == "__main__":
    unittest.main()
