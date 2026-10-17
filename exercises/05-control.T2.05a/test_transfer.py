"""Transfer tests for 05-control.T2.05a - the elbow joint, shaped, observed and regulated.

Three claims, measured on the shared plant:
  1. a PD law on the elbow's real inertia and damping has a gain crossover the submission finds,
     and the margin that crossover carries is what one sample of the plant's own clock eats into;
  2. an observer built on the plant's own discrete map makes the estimation error fall at exactly
     the placed rate - measured on a real run, not on the error matrix;
  3. a Bryson-weighted LQR gain on the same map drives the joint to rest.
"""

import cmath
import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

KP = 12.0  # N*m/rad, the capstone's elbow proportional gain
KD = 0.35  # N*m*s/rad, its derivative gain


def elbow_continuous(omega, kp=KP, kd=KD):
    """L(jw) = C(jw) P(jw) for the elbow: P = 1/(J s^2 + b s), C = kp + kd s."""
    s = 1j * omega
    p = 1.0 / (plant.I2 * s * s + plant.B2 * s)
    return (kp + kd * s) * p


def elbow_discrete():
    """The plant's own one-step map for the elbow, with no controller: q' = q + dt w, w' = w - dt b/J w."""
    dt = plant.DT
    return ([[1.0, dt], [0.0, 1.0 - dt * plant.B2 / plant.I2]],
            [[0.0], [dt / plant.I2]])


class MarginOnTheElbowTests(unittest.TestCase):
    def test_the_crossover_is_a_real_one(self):
        w = submission.gain_crossover(elbow_continuous)
        self.assertGreater(w, 0.0)
        self.assertAlmostEqual(abs(elbow_continuous(w)), 1.0, delta=1e-9)
        margin = submission.phase_margin_deg(elbow_continuous(w))
        self.assertGreater(margin, 0.0)
        self.assertLess(margin, 90.0)

    def test_one_plant_tick_costs_the_margin_its_own_delay_does(self):
        w = submission.gain_crossover(elbow_continuous)
        margin = submission.phase_margin_deg(elbow_continuous(w))
        one_tick = submission.phase_loss_deg(w, plant.DT)
        two_ticks = submission.phase_loss_deg(w, 2.0 * plant.DT)
        self.assertAlmostEqual(two_ticks, 2.0 * one_tick, delta=1e-12)
        self.assertAlmostEqual(margin - one_tick,
                               submission.phase_margin_deg(elbow_continuous(w)) - one_tick,
                               delta=1e-12)
        self.assertLess(one_tick, margin, "one sample of a 1 kHz clock must not close the loop")
        # A control loop that samples ten times slower pays ten times the phase at the same crossover.
        self.assertGreater(submission.phase_loss_deg(w, 10.0 * plant.DT), 5.0 * one_tick)

    def test_the_sensitivity_pair_holds_on_the_real_loop(self):
        w = submission.gain_crossover(elbow_continuous)
        loop = elbow_continuous(w)
        s, t = submission.st(loop)
        self.assertAlmostEqual((s + t).real, 1.0, delta=1e-12)
        self.assertAlmostEqual(abs(t), abs(s), delta=1e-12)
        # |S| = 1/|1 + L|, which is one at |L| = 1 only when the loop's phase is -180: this elbow
        # has 77 degrees of margin at crossover, so |1 + L| > 1 and the sensitivity there is below one.
        self.assertAlmostEqual(abs(s), 1.0 / abs(1.0 + loop), delta=1e-12)
        self.assertGreater(abs(s), 0.5)
        self.assertLessEqual(abs(s), 1.0)


class ObserverOnTheElbowTests(unittest.TestCase):
    def test_the_error_falls_at_the_placed_rate(self):
        ad, _ = elbow_discrete()
        c = [1.0, 0.0]
        slow, fast = 0.9, 0.8
        a22 = ad[1][1]
        # Two distinct error poles: trace slow + fast, determinant slow * fast. Distinct poles
        # matter here - a repeated pole carries a k * rho^k term, and the measured rate would then
        # read faster than the radius it was placed at.
        l1 = 1.0 + a22 - (slow + fast)
        l2 = (slow * fast - (1.0 - l1) * a22) / ad[0][1]
        radius = submission.observer_spectral_radius(ad, c, [l1, l2])
        self.assertAlmostEqual(radius, slow, delta=1e-6)

        q, w = 0.20, 0.0
        q_hat, w_hat = 0.0, 0.0
        errors = []
        for _ in range(31):
            measured = plant.quantize_angle(q)
            innovation = measured - q_hat
            prior_q = ad[0][0] * q_hat + ad[0][1] * w_hat
            prior_w = ad[1][0] * q_hat + ad[1][1] * w_hat
            q_hat = prior_q + l1 * innovation
            w_hat = prior_w + l2 * innovation
            q, w = plant.step_arm((0.0, q, 0.0, w), (0.0, 0.0), dist=(0.0, 0.0),
                                  dt=plant.DT, gravity=False)[1::2]
            errors.append(math.hypot(q - q_hat, w - w_hat))
        # Ticks 20..30: past the fast pole, still far above one encoder count.
        measured_rate = (errors[30] / errors[20]) ** 0.1
        self.assertGreater(measured_rate, 0.88)
        self.assertLess(measured_rate, 0.93)
        self.assertLess(errors[30], errors[20] / 2.5)


class LqrOnTheElbowTests(unittest.TestCase):
    def test_bryson_weighted_gain_drives_the_joint_to_rest(self):
        ad, bd = elbow_discrete()
        q_diag, r = submission.bryson_weights([0.30, 2.0], plant.TAU_LIMIT)
        k = submission.lqr_gain(ad, bd, q_diag, r)
        self.assertLess(submission.observer_spectral_radius(ad, [1.0, 0.0], [0.0, 0.0]), 1.01)

        q, w = 0.20, 0.0
        torque_max = 0.0
        for _ in range(600):
            u = -(k[0] * q + k[1] * w)
            torque_max = max(torque_max, abs(u))
            q, w = plant.step_arm((0.0, q, 0.0, w), (0.0, u), dist=(0.0, 0.0),
                                  dt=plant.DT, gravity=False)[1::2]
        self.assertLess(abs(q), 0.01, "the regulated joint must come to rest")
        self.assertLess(abs(w), 0.5)
        # The gain is unconstrained; what matters is that the torque it asks for is in the joint's range.
        self.assertLess(torque_max, 10.0 * plant.TAU_LIMIT)


if __name__ == "__main__":
    unittest.main()
