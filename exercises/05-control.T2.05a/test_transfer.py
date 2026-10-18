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
        self.assertGreater(
            w, 0.0,
            msg="expected a positive crossover frequency on the elbow loop; a non-positive answer likely returned the bracket end - check the scan finds |L| = 1 > 0",
        )
        self.assertAlmostEqual(
            abs(elbow_continuous(w)), 1.0, delta=1e-9,
            msg="expected |L| = 1 at the returned elbow crossover; a value above 1 likely stopped the search at the first sample - check the crossing is refined",
        )
        margin = submission.phase_margin_deg(elbow_continuous(w))
        self.assertGreater(
            margin, 0.0,
            msg="expected this PD loop to be stable at crossover, so a positive margin; a negative margin likely lost the 180 deg complement - check phase_margin_deg",
        )
        self.assertLess(
            margin, 90.0,
            msg="expected less than 90 deg of margin from a PD loop with real damping; a larger margin likely measured phase from 0 instead of -180 - check the reference angle",
        )

    def test_one_plant_tick_costs_the_margin_its_own_delay_does(self):
        w = submission.gain_crossover(elbow_continuous)
        margin = submission.phase_margin_deg(elbow_continuous(w))
        one_tick = submission.phase_loss_deg(w, plant.DT)
        two_ticks = submission.phase_loss_deg(w, 2.0 * plant.DT)
        self.assertAlmostEqual(
            two_ticks, 2.0 * one_tick, delta=1e-12,
            msg="expected two plant ticks to cost twice one tick of phase; a nonlinear ratio likely applied atan to the delay - check the loss is linear in tau",
        )
        self.assertAlmostEqual(
            margin - one_tick,
            submission.phase_margin_deg(elbow_continuous(w)) - one_tick,
            delta=1e-12,
            msg="expected the margin to be the same call with and without the tick subtracted; a mismatch likely recomputed the margin from a different loop - check both use the same crossover",
        )
        self.assertLess(
            one_tick, margin,
            msg="expected one sample of a 1 kHz clock not to close the loop; a loss above the margin likely divided by dt instead of multiplying - check w * dt",
        )
        # A control loop that samples ten times slower pays ten times the phase at the same crossover.
        self.assertGreater(
            submission.phase_loss_deg(w, 10.0 * plant.DT), 5.0 * one_tick,
            msg="expected a ten-times-slower clock to cost ten times the phase (5x would already fail); a smaller loss likely clamped the delay - check tau scales with dt",
        )

    def test_the_sensitivity_pair_holds_on_the_real_loop(self):
        w = submission.gain_crossover(elbow_continuous)
        loop = elbow_continuous(w)
        s, t = submission.st(loop)
        self.assertAlmostEqual(
            (s + t).real, 1.0, delta=1e-12,
            msg="expected Re(S + T) = 1 on the real elbow loop too; another value likely computed T as 1/S - check both come from L/(1+L) and 1/(1+L)",
        )
        self.assertAlmostEqual(
            abs(t), abs(s), delta=1e-12,
            msg="expected |T| = |S| at the elbow crossover because |L| = 1 there; unequal values likely used a cached L - check both are evaluated at the same w",
        )
        # |S| = 1/|1 + L|, which is one at |L| = 1 only when the loop's phase is -180: this elbow
        # has 77 degrees of margin at crossover, so |1 + L| > 1 and the sensitivity there is below one.
        self.assertAlmostEqual(
            abs(s), 1.0 / abs(1.0 + loop), delta=1e-12,
            msg="expected |S| = 1/|1 + L|; a value near 1.0 likely returned 1/(1 + |L|), which loses the phase - check the complex denominator",
        )
        self.assertGreater(
            abs(s), 0.5,
            msg="expected the elbow sensitivity above 0.5 at crossover with 77 deg of margin; a smaller value likely used a much larger loop gain - check L is unnormalised",
        )
        self.assertLessEqual(
            abs(s), 1.0,
            msg="expected |S| <= 1 here because |1 + L| > 1 at this phase; a value above 1 likely divided by |L| - 1 - check the sign under the root",
        )


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
        self.assertAlmostEqual(
            radius, slow, delta=1e-6,
            msg="expected the error radius to equal the slower placed pole 0.9; a radius near 1.0 likely used the plant's A - check Ad - L C is what the radius is read from",
        )

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
        self.assertGreater(
            measured_rate, 0.88,
            msg="expected the measured error to fall no faster than the placed 0.9 pole; a smaller rate means it fell faster, which usually means a repeated pole - check the two poles are distinct",
        )
        self.assertLess(
            measured_rate, 0.93,
            msg="expected the measured decay near 0.9 per tick; a larger rate means the error barely fell, which likely means the innovation used a stale measurement - check the order of predict and correct",
        )
        self.assertLess(
            errors[30], errors[20] / 2.5,
            msg="expected the estimate to be well past half its tick-20 error by tick 30; a slower fall likely planted both poles at one value - check the L vector",
        )


class LqrOnTheElbowTests(unittest.TestCase):
    def test_bryson_weighted_gain_drives_the_joint_to_rest(self):
        ad, bd = elbow_discrete()
        q_diag, r = submission.bryson_weights([0.30, 2.0], plant.TAU_LIMIT)
        k = submission.lqr_gain(ad, bd, q_diag, r)
        self.assertLess(
            submission.observer_spectral_radius(ad, [1.0, 0.0], [0.0, 0.0]), 1.01,
            msg="expected the elbow's own discrete map to be marginally stable with no correction (radius <= 1); a larger radius likely built Ad with the wrong damping term - check 1 - dt b/J",
        )

        q, w = 0.20, 0.0
        torque_max = 0.0
        for _ in range(600):
            u = -(k[0] * q + k[1] * w)
            torque_max = max(torque_max, abs(u))
            q, w = plant.step_arm((0.0, q, 0.0, w), (0.0, u), dist=(0.0, 0.0),
                                  dt=plant.DT, gravity=False)[1::2]
        self.assertLess(
            abs(q), 0.01,
            msg="expected the regulated elbow to come to rest within 0.01 rad after 600 ticks; a larger residual likely means the gain was taken from one Riccati step - check the iteration converged",
        )
        self.assertLess(
            abs(w), 0.5,
            msg="expected the joint speed to settle below 0.5 rad/s with the Bryson-weighted gain; a larger speed likely means K was scaled from the wrong Q - check the weights come from 1/max^2",
        )
        # The gain is unconstrained; what matters is that the torque it asks for is in the joint's range.
        self.assertLess(
            torque_max, 10.0 * plant.TAU_LIMIT,
            msg="expected the unconstrained gain to ask for less than ten times the joint limit; a larger torque likely means Q overwhelmed R - check the Bryson weights are on the same scale",
        )


if __name__ == "__main__":
    unittest.main()
