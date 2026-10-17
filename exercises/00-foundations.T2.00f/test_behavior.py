"""Behaviour tests for 00-foundations.T2.00f.

Each test names the mistake it catches:
  * an alias that folds once and then stops, leaving frequencies above Nyquist where they are;
  * a pre-warp that ignores the tangent, so the round trip through Tustin misses by 100 Hz;
  * a notch whose numerator is not normalized, so DC gain is no longer one;
  * a biquad that updates its delay states in the wrong order (TDF-I ordering inside TDF-II);
  * covariance propagated as A Sigma A + Q, without the transpose.
"""

import math
import unittest

import harness

submission = harness.load_submission()


def rms(values):
    return math.sqrt(sum(v * v for v in values) / len(values))


class AliasingTests(unittest.TestCase):
    def test_nyquist_is_half_the_sample_rate(self):
        self.assertAlmostEqual(submission.nyquist_hz(4000.0), 2000.0, delta=1e-12)
        self.assertAlmostEqual(submission.nyquist_hz(1000.0), 500.0, delta=1e-12)

    def test_worked_examples(self):
        self.assertAlmostEqual(submission.alias_hz(3150.0, 4000.0), 850.0, delta=1e-12)
        self.assertAlmostEqual(submission.alias_hz(2700.0, 2000.0), 700.0, delta=1e-12)
        self.assertAlmostEqual(submission.alias_hz(9000.0, 4000.0), 1000.0, delta=1e-12)

    def test_below_nyquist_passes_through(self):
        self.assertAlmostEqual(submission.alias_hz(100.0, 4000.0), 100.0, delta=1e-12)
        self.assertAlmostEqual(submission.alias_hz(0.0, 4000.0), 0.0, delta=1e-12)

    def test_nyquist_itself_is_unchanged(self):
        self.assertAlmostEqual(submission.alias_hz(2000.0, 4000.0), 2000.0, delta=1e-12)

    def test_mirror_half_folds_down(self):
        # 3/4 of the sample rate is the mirror of 1/4 of it.
        self.assertAlmostEqual(submission.alias_hz(3000.0, 4000.0), 1000.0, delta=1e-12)
        self.assertAlmostEqual(submission.alias_hz(3900.0, 4000.0), 100.0, delta=1e-12)


class WarpingTests(unittest.TestCase):
    def test_prewarp_matches_the_module_value(self):
        self.assertAlmostEqual(submission.prewarp_omega(850.0, 4000.0), 6306.6915, delta=1e-3)
        self.assertAlmostEqual(submission.prewarp_omega(600.0, 2000.0), 5505.5277, delta=1e-3)

    def test_unwarped_tustin_misses_by_a_hundred_hertz(self):
        landed = submission.tustin_hz(2.0 * math.pi * 850.0, 4000.0)
        self.assertAlmostEqual(landed, 749.4803, delta=1e-3)
        self.assertAlmostEqual(850.0 - landed, 100.5197, delta=1e-3)

    def test_prewarp_round_trips(self):
        for f0, fs in ((850.0, 4000.0), (600.0, 2000.0), (47.0, 1000.0), (1.0, 50.0)):
            omega_a = submission.prewarp_omega(f0, fs)
            self.assertAlmostEqual(submission.tustin_hz(omega_a, fs), f0, delta=1e-9)

    def test_the_map_approaches_nyquist(self):
        # An infinite analog frequency approaches fs/2 from below, and never reaches it.
        self.assertAlmostEqual(submission.tustin_hz(1e12, 4000.0), 2000.0, delta=1e-3)
        self.assertLess(submission.tustin_hz(1e12, 4000.0), 2000.0)
        self.assertAlmostEqual(submission.tustin_hz(0.0, 4000.0), 0.0, delta=1e-12)


class BiquadTests(unittest.TestCase):
    def setUp(self):
        self.f0 = 850.0
        self.fs = 4000.0
        self.coeffs = submission.notch_coeffs(self.f0, self.fs, 5.0)

    def test_notch_is_symmetric(self):
        b0, b1, b2, a1, a2 = self.coeffs
        self.assertAlmostEqual(b2, b0, delta=1e-15)
        self.assertAlmostEqual(a1, b1, delta=1e-15)
        self.assertLess(abs(a2), 1.0)

    def test_dc_gain_is_one(self):
        b0, b1, b2, a1, a2 = self.coeffs
        gain = (b0 + b1 + b2) / (1.0 + a1 + a2)
        self.assertAlmostEqual(gain, 1.0, delta=1e-12)
        out = submission.apply_biquad(self.coeffs, [1.0] * 2000)
        self.assertAlmostEqual(out[-1], 1.0, delta=1e-9)

    def test_null_at_the_target_frequency(self):
        n = 8000
        samples = [math.sin(2.0 * math.pi * self.f0 * k / self.fs + 0.3) for k in range(n)]
        out = submission.apply_biquad(self.coeffs, samples)
        tail = out[n // 2:]
        self.assertLess(rms(tail) / rms(samples), 1e-3, "the notch did not reach the target frequency")

    def test_a_tone_away_from_the_notch_passes(self):
        n = 4000
        samples = [math.sin(2.0 * math.pi * 200.0 * k / self.fs) for k in range(n)]
        out = submission.apply_biquad(self.coeffs, samples)
        tail_out, tail_in = out[n // 2:], samples[n // 2:]
        ratio = rms(tail_out) / rms(tail_in)
        self.assertGreater(ratio, 0.9)
        self.assertLess(ratio, 1.1)

    def test_the_filter_has_the_same_length_and_starts_from_rest(self):
        out = submission.apply_biquad(self.coeffs, [0.0] * 5)
        self.assertEqual(len(out), 5)
        self.assertTrue(all(value == 0.0 for value in out))


class CovarianceTests(unittest.TestCase):
    def test_matches_the_module_example(self):
        a = [[1.0, 0.1], [0.0, 1.0]]
        sigma = [[1.0, 0.0], [0.0, 4.0]]
        q = [[0.0, 0.0], [0.0, 0.0]]
        out = submission.covariance_propagate(a, sigma, q)
        self.assertAlmostEqual(out[0][0], 1.04, delta=1e-12)
        self.assertAlmostEqual(out[0][1], 0.4, delta=1e-12)
        self.assertAlmostEqual(out[1][0], 0.4, delta=1e-12)
        self.assertAlmostEqual(out[1][1], 4.0, delta=1e-12)

    def test_adds_the_process_noise(self):
        a = [[1.0, 0.0], [0.0, 1.0]]
        sigma = [[2.0, 0.5], [0.5, 3.0]]
        q = [[0.25, 0.0], [0.0, 0.75]]
        out = submission.covariance_propagate(a, sigma, q)
        self.assertAlmostEqual(out[0][0], 2.25, delta=1e-12)
        self.assertAlmostEqual(out[1][1], 3.75, delta=1e-12)
        self.assertAlmostEqual(out[0][1], 0.5, delta=1e-12)

    def test_off_diagonal_terms_couple_the_states(self):
        a = [[1.0, 1.0], [0.0, 1.0]]
        sigma = [[1.0, 0.0], [0.0, 1.0]]
        zero = [[0.0, 0.0], [0.0, 0.0]]
        out = submission.covariance_propagate(a, sigma, zero)
        self.assertAlmostEqual(out[0][0], 2.0, delta=1e-12)
        self.assertAlmostEqual(out[0][1], 1.0, delta=1e-12)
        self.assertAlmostEqual(out[1][1], 1.0, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
