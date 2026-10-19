"""Behaviour tests for 00-foundations.T2.00j - covariance and the predict step.

Each test names the mistake it catches:
  * a predict that multiplies by A once, leaving an asymmetric covariance;
  * a predict that ignores Q, so the variance never grows;
  * a symmetrising guard that copies one half instead of averaging both;
  * a shape mismatch that is accepted and produces a plausible-looking matrix.
"""

import unittest

import harness

submission = harness.load_submission()


class PredictTests(unittest.TestCase):
    def test_matches_the_module_example(self):
        out = submission.covariance_propagate(
            [[1.0, 0.1], [0.0, 1.0]], [[0.01, 0.0], [0.0, 0.25]], [[0.001, 0.0], [0.0, 0.002]]
        )
        self.assertAlmostEqual(
            out[0][0], 0.0135, delta=1e-12,
            msg="expected P11 = 0.0135 after one propagation; a result near 0.011 likely means "
                "the off-diagonal cross term was dropped - check A Sigma A^T",
        )
        self.assertAlmostEqual(
            out[0][1], 0.025, delta=1e-12,
            msg="expected P12 = 0.025 from the coupled states; zero likely means the transpose "
                "was omitted or the product is not symmetric",
        )
        self.assertAlmostEqual(
            out[1][0], 0.025, delta=1e-12,
            msg="expected P21 = P12 = 0.025; an asymmetric result likely means only one half "
                "was computed - check the transpose",
        )
        self.assertAlmostEqual(
            out[1][1], 0.252, delta=1e-12,
            msg="expected P22 = 0.25 + 0.002 = 0.252; a different value likely means the wrong "
                "row was scaled - check the multiply order",
        )

    def test_adds_the_process_noise(self):
        out = submission.covariance_propagate(
            [[1.0, 0.0], [0.0, 1.0]], [[2.0, 0.5], [0.5, 3.0]], [[0.25, 0.0], [0.0, 0.75]]
        )
        self.assertAlmostEqual(
            out[0][0], 2.25, delta=1e-12,
            msg="expected Q to be added after propagation (2.0 + 0.25); a result of 2.0 likely "
                "means Q was ignored - check the addition",
        )
        self.assertAlmostEqual(
            out[1][1], 3.75, delta=1e-12,
            msg="expected 3.0 + 0.75 = 3.75; a result of 3.0 likely means only the first Q row "
                "was added - check the whole matrix",
        )
        self.assertAlmostEqual(
            out[0][1], 0.5, delta=1e-12,
            msg="expected the off-diagonal to stay 0.5 with a diagonal Q; a different value "
                "likely means Q was multiplied instead of added",
        )

    def test_off_diagonal_terms_couple_the_states(self):
        out = submission.covariance_propagate(
            [[1.0, 1.0], [0.0, 1.0]], [[1.0, 0.0], [0.0, 1.0]], [[0.0, 0.0], [0.0, 0.0]]
        )
        self.assertAlmostEqual(
            out[0][0], 2.0, delta=1e-12,
            msg="expected P11 = 2.0 once A couples the states; a result of 1.0 likely means the "
                "off-diagonal of A was ignored - check the full product",
        )
        self.assertAlmostEqual(
            out[0][1], 1.0, delta=1e-12,
            msg="expected P12 = 1.0 from the state coupling; zero likely means the product was "
                "computed as A Sigma without the transpose",
        )
        self.assertAlmostEqual(
            out[1][1], 1.0, delta=1e-12,
            msg="expected P22 to stay 1.0 because row 2 is unchanged; a different value likely "
                "means the rows were swapped - check the index order",
        )

    def test_refuses_a_wrong_shaped_matrix(self):
        good = [[1.0, 0.0], [0.0, 1.0]]
        with self.assertRaises(ValueError):
            submission.covariance_propagate([[1.0, 0.0, 0.0]], good, good)
        with self.assertRaises(ValueError):
            submission.covariance_propagate(good, [[1.0, 0.0]], good)
        with self.assertRaises(ValueError):
            submission.covariance_propagate(good, good, [[1.0], [0.0]])


class SymmetrizeTests(unittest.TestCase):
    def test_symmetrize_averages_the_off_diagonals(self):
        out = submission.symmetrize([[1.0, 2.0], [4.0, 3.0]])
        self.assertAlmostEqual(
            out[0][1], 3.0, delta=1e-12,
            msg="expected the average of 2 and 4 = 3; a result of 2 or 4 means one side was "
                "copied instead of averaged - check the formula",
        )
        self.assertAlmostEqual(
            out[1][0], 3.0, delta=1e-12,
            msg="expected the mirrored cell to equal the averaged one; a mismatch means only "
                "one triangle was written",
        )
        self.assertAlmostEqual(
            out[0][0], 1.0, delta=1e-12,
            msg="expected the diagonal to be untouched by symmetrising; a different value means "
                "the average was applied to the diagonal too",
        )
        self.assertAlmostEqual(
            out[1][1], 3.0, delta=1e-12,
            msg="expected the second diagonal cell to stay 3.0; a different value means the "
                "diagonal was rewritten",
        )

    def test_symmetrize_leaves_a_symmetric_matrix_alone(self):
        sigma = [[2.0, 0.5, 0.0], [0.5, 3.0, 0.25], [0.0, 0.25, 4.0]]
        self.assertEqual(
            submission.symmetrize(sigma), sigma,
            msg="expected symmetrising an already-symmetric matrix to return it unchanged; a "
                "difference means the average is off by a factor of two",
        )

    def test_symmetrize_refuses_a_wrong_shape(self):
        with self.assertRaises(ValueError):
            submission.symmetrize([[1.0, 2.0], [3.0]])
        with self.assertRaises(ValueError):
            submission.symmetrize([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])


if __name__ == "__main__":
    unittest.main()
