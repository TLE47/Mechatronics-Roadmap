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
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 0.8), 0.80, delta=1e-12)

    def test_the_worked_naive_update_agrees_at_the_optimal_gain(self):
        # At the optimal gain the two forms coincide; the Joseph form earns its keep elsewhere.
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 0.8),
                               (1.0 - 0.8 * 1.0) * 4.0, delta=1e-12)

    def test_the_optimal_gain(self):
        # K = 4 / (1 * 4 * 1 + 1) = 0.8.
        self.assertAlmostEqual(submission.optimal_gain(4.0, 1.0, 1.0), 0.8, delta=1e-12)

    def test_more_noise_means_a_smaller_gain(self):
        self.assertGreater(submission.optimal_gain(4.0, 1.0, 1.0),
                           submission.optimal_gain(4.0, 1.0, 9.0))

    def test_the_skip_test_posterior(self):
        # P^- = 2, R = 2, K = 0.5: 0.25 * 2 + 0.25 * 2 = 1.0.
        self.assertAlmostEqual(submission.joseph_variance(2.0, 1.0, 2.0, 0.5), 1.0, delta=1e-12)

    def test_the_gate_test_posterior(self):
        # P^- = 10, R = 1, K = 1.2: (1 - 1.2)^2 * 10 + 1.44 = 0.4 + 1.44 = 1.84.
        self.assertAlmostEqual(submission.joseph_variance(10.0, 1.0, 1.0, 1.2), 1.84, delta=1e-9)

    def test_a_double_sized_gain_keeps_the_variance_positive(self):
        # K_bad = 1.5 puts the naive (1 - K H) P^- at -2.0; the Joseph form squares it:
        # (-0.5)^2 * 4 + 1.5^2 * 1 = 1 + 2.25 = 3.25, positive where the naive form is not.
        naive = (1.0 - 1.5 * 1.0) * 4.0
        self.assertAlmostEqual(naive, -2.0, delta=1e-12)
        self.assertLess(naive, 0.0)
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 1.5), 3.25, delta=1e-12)
        self.assertGreater(submission.joseph_variance(4.0, 1.0, 1.0, 1.5), 0.0)

    def test_the_very_noisy_case_stays_positive(self):
        # K = 0 keeps the prior: Joseph returns it exactly, and it is never negative.
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 0.0), 4.0, delta=1e-12)

    def test_the_noise_term_is_not_dropped(self):
        # With K = 1, H = 1 the prior term vanishes and only K^2 R is left: 2.5.
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 2.5, 1.0), 2.5, delta=1e-12)

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
        self.assertAlmostEqual(submission.nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04]),
                               1.0, delta=1e-12)

    def test_a_doubled_error_is_four_times_the_nees(self):
        one = submission.nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04])
        two = submission.nees_diagonal([0.40, 0.0, 0.0], [0.04, 0.04, 0.04])
        self.assertAlmostEqual(two / one, 4.0, delta=1e-12)

    def test_a_smaller_claimed_variance_is_a_larger_nees(self):
        # The same 0.20 rad error against a filter that claims 0.01: 4.0, the overconfident flag.
        self.assertAlmostEqual(submission.nees_diagonal([0.20], [0.01]), 4.0, delta=1e-12)

    def test_a_zero_variance_and_a_length_mismatch_are_refused(self):
        with self.assertRaises(ValueError):
            submission.nees_diagonal([0.20], [0.0])
        with self.assertRaises(ValueError):
            submission.nees_diagonal([0.20, 0.0], [0.04])


if __name__ == "__main__":
    unittest.main()
