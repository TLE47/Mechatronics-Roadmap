"""Transfer test for 00-foundations.T2.00i - notching the plant's own elbow mode.

The claim is measured against the shared plant rather than restated: the pre-warped prototype maps
back onto the elbow's damped mode at the capstone's 1 kHz tick, the correction grows once the
sample rate is coarse enough for warping to matter, and the resulting notch really nulls a tone
at that mode.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

K_ELBOW = 8.0  # N*m/rad, the elbow stiffness the 00c and 00e packages use


class NotchAtTheJointTests(unittest.TestCase):
    def setUp(self):
        wn = math.sqrt(K_ELBOW / plant.I2)
        zeta = plant.B2 / (2.0 * math.sqrt(plant.I2 * K_ELBOW))
        self.f_damped = wn * math.sqrt(1.0 - zeta * zeta) / (2.0 * math.pi)
        self.fs = 1.0 / plant.DT

    def test_a_notch_at_the_joint_mode_lands_where_it_was_asked(self):
        omega_a = submission.prewarp_omega(self.f_damped, self.fs)
        self.assertAlmostEqual(
            submission.tustin_hz(omega_a, self.fs), self.f_damped, delta=1e-9,
            msg="expected the pre-warped prototype to map back to the requested notch "
                "frequency at 1 kHz; a drift of a few hertz means the two maps disagree about "
                "the tangent - check both formulas use fs/2",
        )
        self.assertGreater(
            submission.prewarp_omega(self.f_damped, self.fs),
            2.0 * math.pi * self.f_damped,
            msg="expected the pre-warped analog frequency to exceed its own uncorrected value, "
                "since warping stretches toward Nyquist; equality means the correction was not "
                "applied - check the tangent term",
        )
        coarse = 60.0
        on_target = submission.prewarp_omega(self.f_damped, coarse)
        self.assertGreater(
            on_target, 2.0 * math.pi * self.f_damped * 1.02,
            msg="expected a 60 Hz sample rate to push the pre-warp more than two percent above "
                "the uncorrected frequency, where the error becomes real hertz; a smaller "
                "correction means the map ignored how close the notch sits to Nyquist",
        )
        self.assertAlmostEqual(
            submission.tustin_hz(on_target, coarse), self.f_damped, delta=1e-9,
            msg="expected the coarse-rate round trip to land back on the requested notch, "
                "which is the only reason a 60 Hz controller could place it at all; a "
                "several-hertz miss means the pair is not a true inverse at that rate",
        )

    def test_the_notch_really_nulls_a_tone_at_the_mode(self):
        coeffs = submission.notch_coeffs(self.f_damped, self.fs, 8.0)
        n = 4000
        tone = [math.sin(2.0 * math.pi * self.f_damped * k / self.fs) for k in range(n)]
        out = submission.apply_biquad(coeffs, tone)
        tail_out, tail_in = out[n // 2:], tone[n // 2:]
        energy_in = sum(v * v for v in tail_in)
        energy_out = sum(v * v for v in tail_out)
        self.assertLess(
            energy_out, 1e-4 * energy_in,
            msg="expected the notch to remove the elbow mode from a tone at that frequency; a "
                "surviving tone means the coefficients were built for a different f0 than the "
                "one the plant actually has - check the inertia and stiffness used",
        )


if __name__ == "__main__":
    unittest.main()
