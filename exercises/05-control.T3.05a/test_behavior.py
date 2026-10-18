"""Behaviour tests for 05-control.T3.05a.

Each test names the mistake it catches:
  * a covariance update written as the naive subtraction (1 - K H) P^-, which goes negative at a
    gain of 1.5 where the Joseph form stays at 3.25 - the module's first Common-mistakes row;
  * an optimal gain that forgets the measurement noise R in the denominator;
  * a Joseph form that keeps the prior but drops the K R K term, so a noisy sensor looks free;
  * a NEES that subtracts the variance instead of dividing by it;
  * a guard that lets a negative variance or a zero-noise measurement through.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class JosephTests(unittest.TestCase):
    def test_the_worked_posterior(self):
        # P^- = 4, H = 1, R = 1, K = 0.8: (0.2)^2 * 4 + 0.8^2 * 1 = 0.80.
        self.assertAlmostEqual(
            submission.joseph_variance(4.0, 1.0, 1.0, 0.8), 0.80, delta=1e-12,
            msg="expected the Joseph form at K = 0.8 to give 0.80, the sum of the squared prior "
                "and measurement terms; 0.8 from a bare subtraction means the K R K term is "
                "missing - check both terms",
        )

    def test_the_worked_naive_update_agrees_at_the_optimal_gain(self):
        # At the optimal gain the two forms coincide; the Joseph form earns its keep elsewhere.
        self.assertAlmostEqual(
            submission.joseph_variance(4.0, 1.0, 1.0, 0.8),
            (1.0 - 0.8 * 1.0) * 4.0, delta=1e-12,
            msg="expected the Joseph form to agree with the naive update at the optimal gain, "
                "0.80 each; a gap here means the two forms are not the same estimator and one of "
                "them is wrong - check the algebra",
        )

    def test_the_optimal_gain(self):
        # K = 4 / (1 * 4 * 1 + 1) = 0.8.
        self.assertAlmostEqual(
            submission.optimal_gain(4.0, 1.0, 1.0), 0.8, delta=1e-12,
            msg="expected the optimal gain to be 4 / 5 = 0.8 with equal prior and noise; 0.25 "
                "means the ratio was inverted and the filter would distrust its sensor - check "
                "H P / (H P H + R)",
        )

    def test_more_noise_means_a_smaller_gain(self):
        self.assertGreater(
            submission.optimal_gain(4.0, 1.0, 1.0),
            submission.optimal_gain(4.0, 1.0, 9.0),
            msg="expected a noisier sensor to earn a smaller gain, 0.8 against 0.31; an equal or "
                "larger value means R never entered the denominator - check the formula",
        )

    def test_the_skip_test_posterior(self):
        # P^- = 2, R = 2, K = 0.5: 0.25 * 2 + 0.25 * 2 = 1.0.
        self.assertAlmostEqual(
            submission.joseph_variance(2.0, 1.0, 2.0, 0.5), 1.0, delta=1e-12,
            msg="expected the skip test's posterior to be 1.0, half the prior and half the noise; "
                "0.5 means only the prior term was computed - check the K^2 R half",
        )

    def test_the_gate_test_posterior(self):
        # P^- = 10, R = 1, K = 1.2: (1 - 1.2)^2 * 10 + 1.44 = 0.4 + 1.44 = 1.84.
        self.assertAlmostEqual(
            submission.joseph_variance(10.0, 1.0, 1.0, 1.2), 1.84, delta=1e-9,
            msg="expected an over-unity gain of 1.2 to leave 1.84, since (-0.2)^2 x 10 = 0.4 "
                "cannot go negative; -2.0 means the naive subtraction was used - check the square",
        )

    def test_a_double_sized_gain_keeps_the_variance_positive(self):
        # K_bad = 1.5 puts the naive (1 - K H) P^- at -2.0; the Joseph form squares it:
        # (-0.5)^2 * 4 + 1.5^2 * 1 = 1 + 2.25 = 3.25, positive where the naive form is not.
        naive = (1.0 - 1.5 * 1.0) * 4.0
        self.assertAlmostEqual(
            naive, -2.0, delta=1e-12,
            msg="expected the naive update at K = 1.5 to give -2.0, the negative variance the "
                "module warns about; a positive value means the test cannot show the failure - "
                "check the arithmetic",
        )
        self.assertLess(
            naive, 0.0,
            msg="expected the naive covariance to be genuinely negative at this gain, so the "
                "comparison below has content; a non-negative value means the gain was not "
                "over-unity after all",
        )
        self.assertAlmostEqual(
            submission.joseph_variance(4.0, 1.0, 1.0, 1.5), 3.25, delta=1e-12,
            msg="expected the Joseph form to stay at 3.25 for the same gain, the module's own "
                "worked number; a smaller value means the noise term or the square was dropped",
        )
        self.assertGreater(
            submission.joseph_variance(4.0, 1.0, 1.0, 1.5), 0.0,
            msg="expected the Joseph posterior to stay strictly positive, which is what makes it "
                "the safe form; a negative value means the implementation is the naive one",
        )

    def test_the_very_noisy_case_stays_positive(self):
        # K = 0 keeps the prior: Joseph returns it exactly, and it is never negative.
        self.assertAlmostEqual(
            submission.joseph_variance(4.0, 1.0, 1.0, 0.0), 4.0, delta=1e-12,
            msg="expected a zero gain to leave the prior untouched at 4.0, the limiting case "
                "where the filter ignores the measurement; a smaller value means an offset or a "
                "missing K term - check both products vanish",
        )

    def test_the_noise_term_is_not_dropped(self):
        # With K = 1, H = 1 the prior term vanishes and only K^2 R is left: 2.5.
        self.assertAlmostEqual(
            submission.joseph_variance(4.0, 1.0, 2.5, 1.0), 2.5, delta=1e-12,
            msg="expected exactly the 2.5 of measurement noise to remain when K = 1 cancels the "
                "prior term; 0.0 means the K R K term is missing, so a noisy sensor looks free",
        )

    def test_a_negative_prior_is_refused(self):
        with self.assertRaises(ValueError):
            submission.joseph_variance(-1.0, 1.0, 1.0, 0.5)
        with self.assertRaises(ValueError):
            submission.optimal_gain(-1.0, 1.0, 1.0)

    def test_zero_noise_or_a_zero_jacobian_is_refused(self):
        with self.assertRaises(ValueError):
            submission.joseph_variance(4.0, 1.0, 0.0, 0.5)
        with self.assertRaises(ValueError):
            submission.optimal_gain(4.0, 0.0, 1.0)


class NeesTests(unittest.TestCase):
    def test_the_gate_test_nees(self):
        # e = [0.20, 0, 0] against variances 0.04: 0.04 / 0.04 = 1.0.
        self.assertAlmostEqual(
            submission.nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04]), 1.0, delta=1e-12,
            msg="expected a 0.20 error against a claimed 0.04 variance to give NEES 1.0; 0.16 "
                "means the variance was subtracted instead of divided - check e^2 / sigma^2",
        )

    def test_a_doubled_error_is_four_times_the_nees(self):
        one = submission.nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04])
        two = submission.nees_diagonal([0.40, 0.0, 0.0], [0.04, 0.04, 0.04])
        self.assertAlmostEqual(
            two / one, 4.0, delta=1e-12,
            msg="expected doubling the error to quadruple the NEES, since the metric is "
                "quadratic; 2.0 means a magnitude ratio was returned - check the square",
        )

    def test_a_smaller_claimed_variance_is_a_larger_nees(self):
        # The same 0.20 rad error against a filter that claims 0.01: 4.0, the overconfident flag.
        self.assertAlmostEqual(
            submission.nees_diagonal([0.20], [0.01]), 4.0, delta=1e-12,
            msg="expected the same 0.20 rad error to read NEES 4.0 against a filter claiming "
                "0.01 variance, four times the gate value; 0.19 means the division was not "
                "performed - check which quantity is the divisor",
        )

    def test_a_zero_variance_and_a_length_mismatch_are_refused(self):
        with self.assertRaises(ValueError):
            submission.nees_diagonal([0.20], [0.0])
        with self.assertRaises(ValueError):
            submission.nees_diagonal([0.20, 0.0], [0.04])


if __name__ == "__main__":
    unittest.main()
