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
        self.assertAlmostEqual(
            submission.nyquist_hz(4000.0),
            2000.0,
            delta=1e-12,
            msg="expected 2000 Hz for a 4000 Hz sample rate; a result of 4000 means the rate was not halved - check the factor of two",
        )
        self.assertAlmostEqual(
            submission.nyquist_hz(1000.0),
            500.0,
            delta=1e-12,
            msg="expected 500 Hz for a 1000 Hz sample rate; anything else likely means the rate was returned unchanged - check the division",
        )

    def test_worked_examples(self):
        self.assertAlmostEqual(
            submission.alias_hz(3150.0, 4000.0),
            850.0,
            delta=1e-12,
            msg="expected 3150 Hz to fold to 850 Hz at 4000 Hz; a result near 3150 likely means no fold happened - check the Nyquist test",
        )
        self.assertAlmostEqual(
            submission.alias_hz(2700.0, 2000.0),
            700.0,
            delta=1e-12,
            msg="expected 2700 Hz to fold to 700 Hz at 2000 Hz; a result near 2700 means no fold ran, and one near 1300 means it mirrored instead of subtracting - check the fold direction",
        )
        self.assertAlmostEqual(
            submission.alias_hz(9000.0, 4000.0),
            1000.0,
            delta=1e-12,
            msg="expected 9000 Hz to fold to 1000 Hz at 4000 Hz; a result of 5000 or 3000 likely means the fold ran once instead of twice - check the loop",
        )

    def test_below_nyquist_passes_through(self):
        self.assertAlmostEqual(
            submission.alias_hz(100.0, 4000.0),
            100.0,
            delta=1e-12,
            msg="expected a 100 Hz tone to pass unchanged below Nyquist; any fold here likely means the Nyquist comparison is inverted - check the branch",
        )
        self.assertAlmostEqual(
            submission.alias_hz(0.0, 4000.0),
            0.0,
            delta=1e-12,
            msg="expected DC to stay at 0 Hz; a non-zero result likely means the fold is applied unconditionally - check the guard for f == 0",
        )

    def test_nyquist_itself_is_unchanged(self):
        self.assertAlmostEqual(
            submission.alias_hz(2000.0, 4000.0),
            2000.0,
            delta=1e-12,
            msg="expected exactly Nyquist to stay at 2000 Hz; folding it away likely means the comparison uses > instead of >= - check the boundary",
        )

    def test_mirror_half_folds_down(self):
        # 3/4 of the sample rate is the mirror of 1/4 of it.
        self.assertAlmostEqual(
            submission.alias_hz(3000.0, 4000.0),
            1000.0,
            delta=1e-12,
            msg="expected 3000 Hz to mirror to 1000 Hz at 4000 Hz; a result near 3000 likely means it was left above Nyquist - check the mirror step",
        )
        self.assertAlmostEqual(
            submission.alias_hz(3900.0, 4000.0),
            100.0,
            delta=1e-12,
            msg="expected 3900 Hz to mirror to 100 Hz; a result near 3900 likely means one fold left it above Nyquist - check the loop terminates below Nyquist",
        )


class WarpingTests(unittest.TestCase):
    def test_prewarp_matches_the_module_value(self):
        self.assertAlmostEqual(
            submission.prewarp_omega(850.0, 4000.0),
            6306.6915,
            delta=1e-3,
            msg="expected 6306.6915 rad/s for 850 Hz at 4000 Hz; a result near 5341 means tan() was dropped - check the pre-warp formula",
        )
        self.assertAlmostEqual(
            submission.prewarp_omega(600.0, 2000.0),
            5505.5277,
            delta=1e-3,
            msg="expected 5505.5277 rad/s for 600 Hz at 2000 Hz; a mismatch likely means the half-angle factor is missing - check the 2/T scaling",
        )

    def test_unwarped_tustin_misses_by_a_hundred_hertz(self):
        landed = submission.tustin_hz(2.0 * math.pi * 850.0, 4000.0)
        self.assertAlmostEqual(
            landed,
            749.4803,
            delta=1e-3,
            msg="expected unwarped Tustin to land at 749.4803 Hz; a result near 850 means the inverse map squared the tangent - check the arctangent",
        )
        self.assertAlmostEqual(
            850.0 - landed,
            100.5197,
            delta=1e-3,
            msg="expected the unwarped error to be about 100.5 Hz; a near-zero error likely means the pre-warp was applied when it should not be",
        )

    def test_prewarp_round_trips(self):
        for f0, fs in ((850.0, 4000.0), (600.0, 2000.0), (47.0, 1000.0), (1.0, 50.0)):
            omega_a = submission.prewarp_omega(f0, fs)
            self.assertAlmostEqual(
                submission.tustin_hz(omega_a, fs),
                f0,
                delta=1e-9,
                msg=f"expected a pre-warp/Tustin round trip at {f0} Hz to return {f0} Hz; a drift likely means the two use different conventions - check both formulas",
            )

    def test_the_map_approaches_nyquist(self):
        # An infinite analog frequency approaches fs/2 from below, and never reaches it.
        self.assertAlmostEqual(
            submission.tustin_hz(1e12, 4000.0),
            2000.0,
            delta=1e-3,
            msg="expected an enormous analog frequency to approach 2000 Hz; a much smaller value likely means the arctangent is scaled wrong",
        )
        self.assertLess(
            submission.tustin_hz(1e12, 4000.0),
            2000.0,
            "expected the map to stay strictly below Nyquist; equality likely means the result was clamped instead of mapped - check the arctangent",
        )
        self.assertAlmostEqual(
            submission.tustin_hz(0.0, 4000.0),
            0.0,
            delta=1e-12,
            msg="expected 0 rad/s to map to 0 Hz; a non-zero result likely means a constant offset was added - check the arctangent at zero",
        )


class BiquadTests(unittest.TestCase):
    def setUp(self):
        self.f0 = 850.0
        self.fs = 4000.0
        self.coeffs = submission.notch_coeffs(self.f0, self.fs, 5.0)

    def test_notch_is_symmetric(self):
        b0, b1, b2, a1, a2 = self.coeffs
        self.assertAlmostEqual(
            b2,
            b0,
            delta=1e-15,
            msg="expected b2 == b0 for a symmetric notch; a mismatch likely means the numerator was built without mirroring - check the b coefficients",
        )
        self.assertAlmostEqual(
            a1,
            b1,
            delta=1e-15,
            msg="expected a1 == b1 in a unity-gain notch; a mismatch likely means the denominator reused the wrong sign - check the a coefficients",
        )
        self.assertLess(
            abs(a2),
            1.0,
            "expected |a2| < 1 for a stable second-order section; a value at or above 1 likely means a pole left the unit circle - check the stability condition",
        )

    def test_dc_gain_is_one(self):
        b0, b1, b2, a1, a2 = self.coeffs
        gain = (b0 + b1 + b2) / (1.0 + a1 + a2)
        self.assertAlmostEqual(
            gain,
            1.0,
            delta=1e-12,
            msg="expected DC gain 1.0 from the coefficient sum; a different value likely means the numerator was not normalized - check the division",
        )
        out = submission.apply_biquad(self.coeffs, [1.0] * 2000)
        self.assertAlmostEqual(
            out[-1],
            1.0,
            delta=1e-9,
            msg="expected a settled step to pass at 1.0 through the notch; a different level likely means the gain is scaled wrong - check the steady state",
        )

    def test_null_at_the_target_frequency(self):
        n = 8000
        samples = [math.sin(2.0 * math.pi * self.f0 * k / self.fs + 0.3) for k in range(n)]
        out = submission.apply_biquad(self.coeffs, samples)
        tail = out[n // 2:]
        self.assertLess(
            rms(tail) / rms(samples),
            1e-3,
            "expected the notch to suppress the 850 Hz tone to under 0.1% of its input; a surviving tone likely means the null sits at the wrong frequency - check f0 in the coefficients",
        )

    def test_a_tone_away_from_the_notch_passes(self):
        n = 4000
        samples = [math.sin(2.0 * math.pi * 200.0 * k / self.fs) for k in range(n)]
        out = submission.apply_biquad(self.coeffs, samples)
        tail_out, tail_in = out[n // 2:], samples[n // 2:]
        ratio = rms(tail_out) / rms(tail_in)
        self.assertGreater(
            ratio,
            0.9,
            "expected a 200 Hz tone to pass at nearly full amplitude; a lower ratio likely means the notch is too wide - check the Q value",
        )
        self.assertLess(
            ratio,
            1.1,
            "expected the passband tone not to be amplified; a ratio above 1.1 likely means the filter is not unity gain - check the numerator",
        )

    def test_the_filter_has_the_same_length_and_starts_from_rest(self):
        out = submission.apply_biquad(self.coeffs, [0.0] * 5)
        self.assertEqual(
            len(out),
            5,
            "expected one output sample per input sample; a different length likely means an initial delay row was dropped - check the output list",
        )
        self.assertTrue(
            all(value == 0.0 for value in out),
            "expected silence in to give silence out from rest; a non-zero sample likely means a delay state was left uninitialized - check the starting states",
        )


class CovarianceTests(unittest.TestCase):
    def test_matches_the_module_example(self):
        a = [[1.0, 0.1], [0.0, 1.0]]
        sigma = [[1.0, 0.0], [0.0, 4.0]]
        q = [[0.0, 0.0], [0.0, 0.0]]
        out = submission.covariance_propagate(a, sigma, q)
        self.assertAlmostEqual(
            out[0][0],
            1.04,
            delta=1e-12,
            msg="expected P11 = 1.04 after one propagation; a result near 1.0 likely means the off-diagonal cross term was dropped - check A Sigma A^T",
        )
        self.assertAlmostEqual(
            out[0][1],
            0.4,
            delta=1e-12,
            msg="expected P12 = 0.4 from the coupled states; zero likely means the transpose was omitted or the product is not symmetric",
        )
        self.assertAlmostEqual(
            out[1][0],
            0.4,
            delta=1e-12,
            msg="expected P21 = P12 = 0.4; an asymmetric result likely means only one half was computed - check the transpose",
        )
        self.assertAlmostEqual(
            out[1][1],
            4.0,
            delta=1e-12,
            msg="expected P22 to stay at 4.0 for a unit second row; a different value likely means the wrong row was scaled - check the multiply order",
        )

    def test_adds_the_process_noise(self):
        a = [[1.0, 0.0], [0.0, 1.0]]
        sigma = [[2.0, 0.5], [0.5, 3.0]]
        q = [[0.25, 0.0], [0.0, 0.75]]
        out = submission.covariance_propagate(a, sigma, q)
        self.assertAlmostEqual(
            out[0][0],
            2.25,
            delta=1e-12,
            msg="expected Q to be added after propagation (2.0 + 0.25); a result of 2.0 likely means Q was ignored - check the addition",
        )
        self.assertAlmostEqual(
            out[1][1],
            3.75,
            delta=1e-12,
            msg="expected 3.0 + 0.75 = 3.75; a result of 3.0 likely means only the first Q row was added - check the whole matrix",
        )
        self.assertAlmostEqual(
            out[0][1],
            0.5,
            delta=1e-12,
            msg="expected the off-diagonal to stay 0.5 with a diagonal Q; a different value likely means Q was multiplied instead of added",
        )

    def test_off_diagonal_terms_couple_the_states(self):
        a = [[1.0, 1.0], [0.0, 1.0]]
        sigma = [[1.0, 0.0], [0.0, 1.0]]
        zero = [[0.0, 0.0], [0.0, 0.0]]
        out = submission.covariance_propagate(a, sigma, zero)
        self.assertAlmostEqual(
            out[0][0],
            2.0,
            delta=1e-12,
            msg="expected P11 = 2.0 once A couples the states; a result of 1.0 likely means the off-diagonal of A was ignored - check the full product",
        )
        self.assertAlmostEqual(
            out[0][1],
            1.0,
            delta=1e-12,
            msg="expected P12 = 1.0 from the state coupling; zero likely means the product was computed as A Sigma without the transpose",
        )
        self.assertAlmostEqual(
            out[1][1],
            1.0,
            delta=1e-12,
            msg="expected P22 to stay 1.0 because row 2 is unchanged; a different value likely means the rows were swapped - check the index order",
        )


if __name__ == "__main__":
    unittest.main()
