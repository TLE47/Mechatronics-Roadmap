"""Transfer tests for 00-foundations.T2.00f - the arm's elbow, sampled and estimated.

Three claims, each measured against the shared plant rather than restated:
  1. Euler's matrix for the elbow reproduces the plant's own one-step map, up to the O(dt^2) the
     plant's semi-implicit ordering (position uses the NEW velocity) is worth;
  2. the elbow's damped mode, 8 Hz at the capstone's 1 kHz tick, aliases to a different frequency
     once the controller samples slower than twice it - which is the whole point of fs/2;
  3. the covariance a Kalman predict step produces for that joint matches a Monte-Carlo run of
     states pushed through the plant's own step.
"""

import math
import random
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

K_ELBOW = 8.0  # N*m/rad, the elbow stiffness the 00c and 00e packages use


class PlantMapTests(unittest.TestCase):
    def setUp(self):
        self.j = plant.I2
        self.b = plant.B2
        self.k = K_ELBOW
        self.dt = plant.DT

    def plant_step(self, q, dq, tau):
        state = plant.step_arm((0.0, q, 0.0, dq), (0.0, tau), dist=(0.0, 0.0), dt=self.dt,
                               gravity=False)
        return state[1], state[3]

    def test_euler_matrix_reproduces_the_closed_loop_plant_step(self):
        # The spring is the controller's, not the plant's: tau = k (q_des - q), and the plant's own
        # B2 is the damping the closed loop actually feels.
        b_cmd = 0.1
        total_b = b_cmd + self.b
        ad = [[1.0, self.dt], [-self.dt * self.k / self.j, 1.0 - self.dt * total_b / self.j]]
        bd = [[0.0], [self.dt / self.j]]
        q, dq, q_des = 0.2, 1.0, 0.5
        fast = submission.simulate_discrete(ad, bd, [q, dq], self.k * q_des, 1)
        tau = self.k * (q_des - q) - b_cmd * dq
        slow = self.plant_step(q, dq, tau)
        # The velocity row is identical; the position row differs only by the plant's dt^2 term.
        self.assertAlmostEqual(
            fast[1], slow[1], delta=1e-15,
            msg="expected the velocity row to match the plant's own step to machine precision, "
                "since both use the same acceleration; a mismatch means the damping or the "
                "stiffness entered the velocity row differently - check dt/J",
        )
        ddq = (tau - self.b * dq) / self.j
        self.assertAlmostEqual(
            fast[0] - slow[0], -self.dt * self.dt * ddq, delta=1e-12,
            msg="expected the position rows to differ by exactly -dt^2 times the acceleration, "
                "the term the plant's semi-implicit ordering adds; another offset means the "
                "matrix is not the plant's map - check which velocity the position update uses",
        )
        self.assertLess(
            abs(fast[0] - slow[0]), 1e-3,
            msg="expected that O(dt^2) discrepancy to stay under a milliradian at the 1 ms tick, "
                "which is what makes the discrete model usable at all; a larger gap means the "
                "step size or the stiffness is wrong",
        )
        # Equal to machine precision would mean the plant steps forward Euler, not semi-implicit.
        self.assertGreater(
            abs(fast[0] - slow[0]), 1e-6,
            msg="expected the two position rows to differ by more than a microradian, since the "
                "plant advances position with the new velocity; exact equality means the plant "
                "was rewritten to forward Euler - check step_arm",
        )


class AliasingAtTheJointTests(unittest.TestCase):
    def test_the_elbow_mode_aliases_below_a_slow_sample_rate(self):
        wn = math.sqrt(K_ELBOW / plant.I2)
        zeta = plant.B2 / (2.0 * math.sqrt(plant.I2 * K_ELBOW))
        f_damped = wn * math.sqrt(1.0 - zeta * zeta) / (2.0 * math.pi)
        self.assertGreater(
            f_damped, 6.0,
            msg="expected the elbow's damped mode to sit above 6 Hz, which is why a 12 Hz "
                "controller cannot see it; a lower figure means the stiffness or the inertia was "
                "taken from the wrong joint",
        )
        # At 12 Hz the damped mode sits above the 6 Hz Nyquist limit and folds to fs - f.
        self.assertAlmostEqual(
            submission.alias_hz(f_damped, 12.0), 12.0 - f_damped, delta=1e-9,
            msg="expected the mode above Nyquist to fold to fs - f at a 12 Hz sample rate; the "
                "original frequency means no folding happened - check the comparison with fs/2",
        )
        # At the capstone's 1 kHz tick it is nowhere near the limit.
        self.assertAlmostEqual(
            submission.alias_hz(f_damped, 1000.0), f_damped, delta=1e-9,
            msg="expected the same mode to pass through unchanged at the capstone's 1 kHz tick, "
                "since it is two orders below Nyquist; a different value means the fold is "
                "applied unconditionally",
        )

    def test_a_notch_at_the_joint_mode_lands_where_it_was_asked(self):
        fs = 1.0 / plant.DT
        wn = math.sqrt(K_ELBOW / plant.I2)
        zeta = plant.B2 / (2.0 * math.sqrt(plant.I2 * K_ELBOW))
        f_damped = wn * math.sqrt(1.0 - zeta * zeta) / (2.0 * math.pi)
        omega_a = submission.prewarp_omega(f_damped, fs)
        self.assertAlmostEqual(
            submission.tustin_hz(omega_a, fs), f_damped, delta=1e-9,
            msg="expected the pre-warped prototype to map back to the requested notch frequency "
                "at 1 kHz; a drift of a few hertz means the two maps disagree about the tangent "
                "- check both formulas use fs/2",
        )
        # The unwarped prototype is off by a fraction at 1 kHz, and by real hertz once fs drops.
        self.assertGreater(
            submission.prewarp_omega(f_damped, fs), 2.0 * math.pi * f_damped,
            msg="expected the pre-warped analog frequency to exceed its own uncorrected value, "
                "since warping stretches toward Nyquist; equality means the correction was not "
                "applied - check the tangent term",
        )
        coarse = 60.0
        on_target = submission.prewarp_omega(f_damped, coarse)
        self.assertGreater(
            on_target, 2.0 * math.pi * f_damped * 1.02,
            msg="expected a 60 Hz sample rate to push the pre-warp more than two percent above "
                "the uncorrected frequency, where the error becomes real hertz; a smaller "
                "correction means the map ignored how close the notch sits to Nyquist",
        )
        self.assertAlmostEqual(
            submission.tustin_hz(on_target, coarse), f_damped, delta=1e-9,
            msg="expected the coarse-rate round trip to land back on the requested notch, which "
                "is the only reason a 60 Hz controller could place it at all; a several-hertz "
                "miss means the pair is not a true inverse at that rate",
        )


class CovarianceAtTheJointTests(unittest.TestCase):
    def test_predict_covariance_matches_a_monte_carlo_of_the_plant(self):
        dt = plant.DT
        j, b, k = plant.I2, plant.B2, K_ELBOW
        sigma_q = (2.0 * math.pi / plant.ENCODER_CPR) / math.sqrt(12.0)
        sigma_v = 0.02
        sigma = [[sigma_q * sigma_q, 0.0], [0.0, sigma_v * sigma_v]]
        zero = [[0.0, 0.0], [0.0, 0.0]]

        # The plant's semi-implicit step as a matrix, so the comparison is the plant's map.
        ad = [[1.0 - dt * dt * k / j, dt * (1.0 - dt * b / j)], [-dt * k / j, 1.0 - dt * b / j]]
        predicted = submission.covariance_propagate(ad, sigma, zero)

        rng = random.Random(11)
        n = 4000
        moved = []
        for _ in range(n):
            q_err = rng.gauss(0.0, sigma_q)
            v_err = rng.gauss(0.0, sigma_v)
            q_new, v_new = plant.step_arm(
                (0.0, q_err, 0.0, v_err), (0.0, -k * q_err), dist=(0.0, 0.0), dt=dt, gravity=False
            )[1::2]
            moved.append((q_new, v_new))

        def sample_cov(pairs):
            mean_q = sum(p[0] for p in pairs) / n
            mean_v = sum(p[1] for p in pairs) / n
            cqq = sum((p[0] - mean_q) ** 2 for p in pairs) / (n - 1)
            cvv = sum((p[1] - mean_v) ** 2 for p in pairs) / (n - 1)
            cqv = sum((p[0] - mean_q) * (p[1] - mean_v) for p in pairs) / (n - 1)
            return cqq, cqv, cvv

        cqq, cqv, cvv = sample_cov(moved)
        # 0.9% of sigma_v^2 is the coupling the plant's dt^2 position term adds; allow 15% for
        # 4000 samples, and a floor so a zero cannot pass this by luck.
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
            predicted[0][0], 0.0,
            msg="expected the predicted position variance to be strictly positive, as any "
                "covariance must be; zero means the position row of A was dropped or the noise "
                "never propagated",
        )
        self.assertGreater(
            cvv, 0.0,
            msg="expected the Monte-Carlo velocity variance to be positive, so the comparison "
                "above is not a fluke of identical zeros; a zero sample variance means the "
                "simulated states never moved",
        )


if __name__ == "__main__":
    unittest.main()
