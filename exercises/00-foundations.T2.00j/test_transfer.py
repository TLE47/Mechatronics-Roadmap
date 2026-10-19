"""Transfer tests for 00-foundations.T2.00j - the integration task, run on the shared plant.

The claim is measured rather than restated: the covariance a Kalman predict step produces for the
elbow matches a Monte-Carlo of states pushed through the plant's own step, and predicting twice
grows the variance while keeping the matrix symmetric and positive on the diagonal.
"""

import math
import random
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

K_ELBOW = 8.0  # N*m/rad, the elbow stiffness the 00c and 00e packages use


class CovarianceAtTheJointTests(unittest.TestCase):
    def setUp(self):
        dt = plant.DT
        j, b, k = plant.I2, plant.B2, K_ELBOW
        # The plant's semi-implicit step as a matrix, so the comparison is the plant's own map.
        self.ad = [[1.0 - dt * dt * k / j, dt * (1.0 - dt * b / j)],
                   [-dt * k / j, 1.0 - dt * b / j]]
        self.zero = [[0.0, 0.0], [0.0, 0.0]]
        self.sigma_q = (2.0 * math.pi / plant.ENCODER_CPR) / math.sqrt(12.0)
        self.sigma_v = 0.02

    def test_predict_covariance_matches_a_monte_carlo_of_the_plant(self):
        sigma = [[self.sigma_q * self.sigma_q, 0.0], [0.0, self.sigma_v * self.sigma_v]]
        predicted = submission.covariance_propagate(self.ad, sigma, self.zero)

        rng = random.Random(11)
        n = 4000
        moved = []
        for _ in range(n):
            q_err = rng.gauss(0.0, self.sigma_q)
            v_err = rng.gauss(0.0, self.sigma_v)
            q_new, v_new = plant.step_arm(
                (0.0, q_err, 0.0, v_err), (0.0, -K_ELBOW * q_err), dist=(0.0, 0.0),
                dt=plant.DT, gravity=False,
            )[1::2]
            moved.append((q_new, v_new))

        mean_q = sum(p[0] for p in moved) / n
        mean_v = sum(p[1] for p in moved) / n
        cqq = sum((p[0] - mean_q) ** 2 for p in moved) / (n - 1)
        cvv = sum((p[1] - mean_v) ** 2 for p in moved) / (n - 1)
        cqv = sum((p[0] - mean_q) * (p[1] - mean_v) for p in moved) / (n - 1)

        self.assertLess(
            abs(predicted[0][0] - cqq), max(0.15 * predicted[0][0], 1e-12),
            msg="expected the predicted position variance to match the Monte-Carlo sample within "
                "15 percent at 4000 draws; a larger gap means the matrix or the two noise terms "
                "were entered differently - check A P A^T plus Q",
        )
        self.assertLess(
            abs(predicted[1][1] - cvv), max(0.15 * predicted[1][1], 1e-9),
            msg="expected the predicted velocity variance to match the same sample; a mismatch "
                "means the damping row of A does not match the plant's own B2 - check the matrix",
        )
        self.assertLess(
            abs(predicted[0][1] - cqv), max(0.15 * predicted[1][1], 1e-9),
            msg="expected the predicted position-velocity covariance to match the sample, the "
                "cross term the plant's dt^2 ordering creates; a near-zero prediction means only "
                "the diagonal was propagated",
        )
        self.assertGreater(
            cvv, 0.0,
            msg="expected the Monte-Carlo velocity variance to be positive, so the comparison "
                "is not a fluke of identical zeros; a zero sample variance means the simulated "
                "states never moved",
        )

    def test_predicting_twice_grows_the_variance_when_the_step_adds_noise(self):
        # A stable matrix alone damps the ellipse; it is the process noise Q that makes the
        # uncertainty accumulate, which is exactly what a filter must not lose track of.
        q = [[1e-6, 0.0], [0.0, 1e-6]]
        sigma = [[self.sigma_q * self.sigma_q, 0.0], [0.0, self.sigma_v * self.sigma_v]]
        once = submission.covariance_propagate(self.ad, sigma, q)
        twice = submission.covariance_propagate(self.ad, once, q)
        self.assertGreater(
            twice[0][0], once[0][0],
            msg="expected a second predict step to grow the position variance once the step "
                "adds its own noise; a smaller value means Q was dropped, and a filter that "
                "forgets it grows overconfident",
        )
        self.assertAlmostEqual(
            twice[0][1], twice[1][0], delta=1e-15,
            msg="expected the twice-propagated covariance to stay exactly symmetric; an "
                "asymmetric result means a transpose was dropped somewhere in the chain",
        )
        self.assertGreater(
            twice[0][0] * twice[1][1] - twice[0][1] * twice[1][0], 0.0,
            msg="expected the twice-propagated determinant to stay positive, as any covariance "
                "must; a negative determinant means the matrix is no longer positive "
                "semi-definite and a filter consuming it would produce a negative variance",
        )


if __name__ == "__main__":
    unittest.main()
