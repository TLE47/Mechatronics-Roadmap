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
        self.assertAlmostEqual(posterior, plant.I1 * 1e-6 / (plant.I1 + 1e-6), delta=1e-18)
        self.assertAlmostEqual(posterior, 9.998750156230471e-7, delta=1e-18)

    def test_a_twenty_percent_overconfident_gain_goes_negative_naively(self):
        # R = 1e-3 against a 0.008 prior gives K_opt = 0.8889; 1.2 K_opt = 1.0667 > 1, so the
        # naive update is -5.3333e-4 while the Joseph form is 1.1733e-3.
        gain = 1.2 * submission.optimal_gain(plant.I1, 1.0, 1e-3)
        naive = (1.0 - gain) * plant.I1
        joseph = submission.joseph_variance(plant.I1, 1.0, 1e-3, gain)
        self.assertLess(naive, 0.0)
        self.assertAlmostEqual(naive, -5.333333333333332e-4, delta=1e-15)
        self.assertAlmostEqual(joseph, 1.173333333333333e-3, delta=1e-15)
        self.assertGreater(joseph, 0.0)


if __name__ == "__main__":
    unittest.main()
