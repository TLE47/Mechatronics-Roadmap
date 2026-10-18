"""Transfer tests for 05-control.T3.05a - the covariance update on the plant's own numbers.

Two claims, measured on the shared arm:
  1. at the optimal gain the Joseph form reproduces the scalar Riccati solution P R / (P + R),
     using the plant's own shoulder inertia as the prior;
  2. a gain 20% larger than optimal drives the naive update negative at that same prior, where the
     Joseph form stays positive - the failure a 32-bit filter sees after enough ticks.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class PlantCovarianceTests(unittest.TestCase):
    def test_joseph_matches_the_riccati_solution_at_the_optimal_gain(self):
        # P R / (P + R) with P = I1 and a 1e-6 rad^2 sensor: the two forms must agree exactly.
        gain = submission.optimal_gain(plant.I1, 1.0, 1e-6)
        posterior = submission.joseph_variance(plant.I1, 1.0, 1e-6, gain)
        self.assertAlmostEqual(
            posterior, plant.I1 * 1e-6 / (plant.I1 + 1e-6), delta=1e-18,
            msg="expected the Joseph posterior at the optimal gain to equal the scalar Riccati "
                "solution P R / (P + R) for the plant's own inertia; a gap means the two forms "
                "disagree and one of them is not the optimal estimator - check the gain",
        )
        self.assertAlmostEqual(
            posterior, 9.998750156230471e-7, delta=1e-18,
            msg="expected the posterior to be 9.99875e-7 rad^2 at the plant's 0.008 kg m^2 prior; "
                "a value near 1e-6 means the prior was dropped from the product - check I1",
        )

    def test_a_twenty_percent_overconfident_gain_goes_negative_naively(self):
        # R = 1e-3 against a 0.008 prior gives K_opt = 0.8889; 1.2 K_opt = 1.0667 > 1, so the
        # naive update is -5.3333e-4 while the Joseph form is 1.1733e-3.
        gain = 1.2 * submission.optimal_gain(plant.I1, 1.0, 1e-3)
        naive = (1.0 - gain) * plant.I1
        joseph = submission.joseph_variance(plant.I1, 1.0, 1e-3, gain)
        self.assertLess(
            naive, 0.0,
            msg="expected a gain 20 percent above optimal to drive the naive update negative at "
                "the plant's own prior, which is the 32-bit failure the module describes; a "
                "positive value means the gain never crossed 1 - check the 1.2 factor",
        )
        self.assertAlmostEqual(
            naive, -5.333333333333332e-4, delta=1e-15,
            msg="expected the naive covariance to be -5.3333e-4 rad^2 at that gain; another "
                "value means the prior or the gain came out differently - check both",
        )
        self.assertAlmostEqual(
            joseph, 1.173333333333333e-3, delta=1e-15,
            msg="expected the Joseph form to give a positive 1.1733e-3 rad^2 for the same gain, "
                "the squared terms adding up; a mismatch means the K R K term or the square was "
                "dropped",
        )
        self.assertGreater(
            joseph, 0.0,
            msg="expected the Joseph posterior to stay strictly positive where the naive one "
                "failed; a negative value means the implementation is the naive subtraction in "
                "disguise",
        )


if __name__ == "__main__":
    unittest.main()
