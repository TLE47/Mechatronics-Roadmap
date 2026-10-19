"""Behaviour tests for 00-foundations.T2.00i - pre-warped Tustin biquads.

Each test names the mistake it catches:
  * a pre-warp that ignores the tangent, so the digital notch misses its target by 100 Hz;
  * a notch whose numerator is not normalized, so the DC gain is no longer one;
  * a biquad that feeds the input back instead of the output (TDF-I arithmetic inside TDF-II);
  * a pre-warp asked for a frequency at or past Nyquist, where no finite answer exists.
"""

import math
import unittest

import harness

submission = harness.load_submission()


def rms(values):
    return math.sqrt(sum(v * v for v in values) / len(values))


class WarpingTests(unittest.TestCase):
    def test_prewarp_matches_the_module_value(self):
        self.assertAlmostEqual(
            submission.prewarp_omega(850.0, 4000.0),
            6306.6915,
            delta=1e-2,
            msg="expected 6306.69 rad/s for 850 Hz at 4000 Hz; a result near 5341 means tan() "
                "was dropped - check the pre-warp formula",
        )
        self.assertAlmostEqual(
            submission.prewarp_omega(600.0, 2000.0),
            5505.5277,
            delta=1e-3,
            msg="expected 5505.5277 rad/s for 600 Hz at 2000 Hz; a mismatch likely means the "
                "half-angle factor is missing - check the 2/Ts scaling",
        )

    def test_unwarped_tustin_misses_by_a_hundred_hertz(self):
        landed = submission.tustin_hz(2.0 * math.pi * 850.0, 4000.0)
        self.assertAlmostEqual(
            landed,
            749.4803,
            delta=1e-3,
            msg="expected unwarped Tustin to land at 749.4803 Hz; a result near 850 means the "
                "inverse map squared the tangent - check the arctangent",
        )
        self.assertAlmostEqual(
            850.0 - landed,
            100.5197,
            delta=1e-3,
            msg="expected the unwarped error to be about 100.5 Hz; a near-zero error likely "
                "means the pre-warp was applied when it should not be",
        )

    def test_prewarp_round_trips(self):
        for f0, fs in ((850.0, 4000.0), (600.0, 2000.0), (47.0, 1000.0), (1.0, 50.0)):
            omega_a = submission.prewarp_omega(f0, fs)
            self.assertAlmostEqual(
                submission.tustin_hz(omega_a, fs),
                f0,
                delta=1e-9,
                msg="expected every pre-warp/Tustin round trip to return the frequency it "
                    "started from, at 4000, 2000, 1000 and 50 Hz alike; a drift at the coarse "
                    "rates likely means the two use different conventions - check both formulas",
            )

    def test_the_map_approaches_nyquist(self):
        self.assertAlmostEqual(
            submission.tustin_hz(1e12, 4000.0),
            2000.0,
            delta=1e-3,
            msg="expected an enormous analog frequency to approach 2000 Hz; a much smaller "
                "value likely means the arctangent is scaled wrong",
        )
        self.assertLess(
            submission.tustin_hz(1e12, 4000.0),
            2000.0,
            "expected the map to stay strictly below Nyquist; equality likely means the result "
            "was clamped instead of mapped - check the arctangent",
        )
        self.assertAlmostEqual(
            submission.tustin_hz(0.0, 4000.0),
            0.0,
            delta=1e-12,
            msg="expected 0 rad/s to map to 0 Hz; a non-zero result likely means a constant "
                "offset was added - check the arctangent at zero",
        )

    def test_refuses_an_impossible_target_or_rate(self):
        with self.assertRaises(ValueError):
            submission.prewarp_omega(2000.0, 4000.0)
        with self.assertRaises(ValueError):
            submission.prewarp_omega(850.0, 0.0)
        with self.assertRaises(ValueError):
            submission.tustin_hz(100.0, -4000.0)


class BiquadTests(unittest.TestCase):
    def setUp(self):
        self.f0 = 850.0
        self.fs = 4000.0
        self.coeffs = submission.notch_coeffs(self.f0, self.fs, 5.0)

    def test_notch_is_symmetric(self):
        b0, b1, b2, a1, a2 = self.coeffs
        self.assertAlmostEqual(
            b2, b0, delta=1e-15,
            msg="expected b2 == b0 for a symmetric notch; a mismatch likely means the numerator "
                "was built without mirroring - check the b coefficients",
        )
        self.assertAlmostEqual(
            a1, b1, delta=1e-15,
            msg="expected a1 == b1 in a unity-gain notch; a mismatch likely means the "
                "denominator reused the wrong sign - check the a coefficients",
        )
        self.assertLess(
            abs(a2), 1.0,
            "expected |a2| < 1 for a stable second-order section; a value at or above 1 likely "
            "means a pole left the unit circle - check the stability condition",
        )

    def test_dc_gain_is_one(self):
        b0, b1, b2, a1, a2 = self.coeffs
        gain = (b0 + b1 + b2) / (1.0 + a1 + a2)
        self.assertAlmostEqual(
            gain, 1.0, delta=1e-12,
            msg="expected DC gain 1.0 from the coefficient sum; a different value likely means "
                "the numerator was not normalized - check the division",
        )
        out = submission.apply_biquad(self.coeffs, [1.0] * 2000)
        self.assertAlmostEqual(
            out[-1], 1.0, delta=1e-9,
            msg="expected a settled step to pass at 1.0 through the notch; a different level "
                "likely means the gain is scaled wrong - check the steady state",
        )

    def test_null_at_the_target_frequency(self):
        n = 8000
        samples = [math.sin(2.0 * math.pi * self.f0 * k / self.fs + 0.3) for k in range(n)]
        out = submission.apply_biquad(self.coeffs, samples)
        tail = out[n // 2:]
        self.assertLess(
            rms(tail) / rms(samples),
            1e-3,
            "expected the notch to suppress the 850 Hz tone to under 0.1% of its input; a "
            "surviving tone likely means the null sits at the wrong frequency - check f0 in the "
            "coefficients",
        )

    def test_a_tone_away_from_the_notch_passes(self):
        n = 4000
        samples = [math.sin(2.0 * math.pi * 200.0 * k / self.fs) for k in range(n)]
        out = submission.apply_biquad(self.coeffs, samples)
        tail_out, tail_in = out[n // 2:], samples[n // 2:]
        ratio = rms(tail_out) / rms(tail_in)
        self.assertGreater(
            ratio, 0.9,
            "expected a 200 Hz tone to pass at nearly full amplitude; a lower ratio likely "
            "means the notch is too wide - check the Q value",
        )
        self.assertLess(
            ratio, 1.1,
            "expected the passband tone not to be amplified; a ratio above 1.1 likely means the "
            "filter is not unity gain - check the numerator",
        )

    def test_the_filter_has_the_same_length_and_starts_from_rest(self):
        out = submission.apply_biquad(self.coeffs, [0.0] * 5)
        self.assertEqual(
            len(out), 5,
            "expected one output sample per input sample; a different length likely means an "
            "initial delay row was dropped - check the output list",
        )
        self.assertTrue(
            all(value == 0.0 for value in out),
            "expected silence in to give silence out from rest; a non-zero sample likely means "
            "a delay state was left uninitialized - check the starting states",
        )

    def test_refuses_a_nonsense_quality_factor_or_short_coefficients(self):
        with self.assertRaises(ValueError):
            submission.notch_coeffs(850.0, 4000.0, 0.0)
        with self.assertRaises(ValueError):
            submission.notch_coeffs(4000.0, 4000.0, 5.0)
        with self.assertRaises(ValueError):
            submission.apply_biquad((0.9, -0.4), [1.0, 2.0])


if __name__ == "__main__":
    unittest.main()
