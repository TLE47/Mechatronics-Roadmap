"""Behaviour tests for 00-foundations.T2.00f - sampling and aliasing.

Each test names the mistake it catches:
  * an alias that folds once and then stops, leaving frequencies above Nyquist where they are;
  * an alias that is never folded at all, so the signal frequency comes straight back;
  * a Nyquist limit reported as the sample rate, missing the factor of two;
  * a sample rate of zero or below that is accepted and folds everything to nothing.
"""

import unittest

import harness

submission = harness.load_submission()


class AliasingTests(unittest.TestCase):
    def test_nyquist_is_half_the_sample_rate(self):
        self.assertAlmostEqual(
            submission.nyquist_hz(4000.0),
            2000.0,
            delta=1e-12,
            msg="expected 2000 Hz for a 4000 Hz sample rate; a result of 4000 means the rate "
                "was not halved - check the factor of two",
        )
        self.assertAlmostEqual(
            submission.nyquist_hz(1000.0),
            500.0,
            delta=1e-12,
            msg="expected 500 Hz for a 1000 Hz sample rate; anything else likely means the rate "
                "was returned unchanged - check the division",
        )

    def test_nyquist_refuses_a_nonsense_rate(self):
        with self.assertRaises(ValueError):
            submission.nyquist_hz(0.0)
        with self.assertRaises(ValueError):
            submission.nyquist_hz(-4000.0)

    def test_alias_refuses_a_nonsense_rate(self):
        with self.assertRaises(ValueError):
            submission.alias_hz(100.0, 0.0)
        with self.assertRaises(ValueError):
            submission.alias_hz(100.0, -2000.0)

    def test_worked_examples(self):
        self.assertAlmostEqual(
            submission.alias_hz(3150.0, 4000.0),
            850.0,
            delta=1e-12,
            msg="expected 3150 Hz to fold to 850 Hz at 4000 Hz; a result near 3150 likely means "
                "no fold happened - check the Nyquist comparison",
        )
        self.assertAlmostEqual(
            submission.alias_hz(2700.0, 2000.0),
            700.0,
            delta=1e-12,
            msg="expected 2700 Hz to fold to 700 Hz at 2000 Hz; a result near 2700 means no fold "
                "ran, and one near 1300 means it mirrored instead of subtracting - check the fold "
                "direction",
        )
        self.assertAlmostEqual(
            submission.alias_hz(9000.0, 4000.0),
            1000.0,
            delta=1e-12,
            msg="expected 9000 Hz to fold to 1000 Hz at 4000 Hz; a result of 5000 or 3000 likely "
                "means the remaining tone was not folded back inside the band - check the "
                "remainder",
        )

    def test_below_nyquist_passes_through(self):
        self.assertAlmostEqual(
            submission.alias_hz(100.0, 4000.0),
            100.0,
            delta=1e-12,
            msg="expected a 100 Hz tone to pass unchanged below Nyquist; any fold here likely "
                "means the Nyquist comparison is inverted - check the branch",
        )
        self.assertAlmostEqual(
            submission.alias_hz(0.0, 4000.0),
            0.0,
            delta=1e-12,
            msg="expected DC to stay at 0 Hz; a non-zero result likely means a constant was "
                "added - check the fold at zero",
        )

    def test_nyquist_itself_is_unchanged(self):
        self.assertAlmostEqual(
            submission.alias_hz(2000.0, 4000.0),
            2000.0,
            delta=1e-12,
            msg="expected exactly Nyquist to stay at 2000 Hz; folding it away likely means the "
                "comparison uses >= instead of > - check the boundary",
        )

    def test_mirror_half_folds_down(self):
        # 3/4 of the sample rate is the mirror of 1/4 of it, and 39/40 is the mirror of 1/40.
        self.assertAlmostEqual(
            submission.alias_hz(3000.0, 4000.0),
            1000.0,
            delta=1e-12,
            msg="expected 3000 Hz to mirror to 1000 Hz at 4000 Hz; a result near 3000 likely "
                "means it was left above Nyquist - check the mirror step",
        )
        self.assertAlmostEqual(
            submission.alias_hz(3900.0, 4000.0),
            100.0,
            delta=1e-12,
            msg="expected 3900 Hz to mirror to 100 Hz; a result near 3900 likely means one fold "
                "left it above Nyquist - check the reflection",
        )
        self.assertAlmostEqual(
            submission.alias_hz(1000.0, 4000.0),
            submission.alias_hz(3000.0, 4000.0),
            delta=1e-12,
            msg="expected the seam to be exact: 1000 Hz and 3000 Hz at 4000 Hz are the same "
                "sampled signal, so their aliases must agree; a mismatch means only one side "
                "reflects",
        )


if __name__ == "__main__":
    unittest.main()
