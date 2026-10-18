"""Transfer tests for 03-sensors.T2.03a - the arm's elbow, demodulated and tracked.

Three claims, measured on the shared plant:
  1. a PLL fed the plant's own quantized elbow angle recovers the joint's velocity, and beats a
     one-tick finite difference on the same samples;
  2. Park demodulation at the elbow's own angle turns a balanced three-phase set built from that
     angle into constant DC, tick after tick;
  3. averaging the plant's seeded white noise follows tau^-1/2 - measured, not restated.
"""

import math
import statistics
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def wrap(angle):
    return submission.wrap_pi(angle)


class PllOnTheElbowTests(unittest.TestCase):
    def test_it_tracks_the_joint_velocity_better_than_differencing(self):
        dt = plant.DT
        kp_gain, kd_gain = 12.0, 0.35
        zeta, wn = 1.0, 2.0 * math.pi * 25.0
        kp, ki = 2.0 * zeta * wn, wn * wn
        theta_hat, omega_hat = 0.0, 0.0
        q, dq = 0.3, 0.0
        pll_error = []
        diff_error = []
        previous = plant.quantize_angle(q)
        for k in range(1500):
            tau = -kp_gain * q - kd_gain * dq
            q, dq = plant.step_arm((0.0, q, 0.0, dq), (0.0, tau), dist=(0.0, 0.0),
                                   dt=dt, gravity=False)[1::2]
            measured = plant.quantize_angle(q)
            theta_hat, omega_hat = submission.pll_step(theta_hat, omega_hat, measured, kp, ki, dt)
            differenced = wrap(measured - previous) / dt
            previous = measured
            if k > 200:
                pll_error.append(abs(omega_hat - dq))
                diff_error.append(abs(differenced - dq))
        self.assertLess(
            statistics.mean(pll_error), 0.35,
            msg="expected the PLL to track the joint's rate to under 0.35 rad/s on the plant's "
                "quantized elbow angle; a larger error means the loop bandwidth cannot follow "
                "this trajectory - check the gains and the integrator sign",
        )
        self.assertLess(
            statistics.mean(pll_error), statistics.mean(diff_error),
            msg="expected the PLL's mean error to beat a one-tick finite difference on the same "
                "samples, which is the whole reason to carry a loop; a finite difference winning "
                "means the PLL is not filtering - check the loop bandwidth against the count "
                "quantisation",
        )


class DemodulationOnTheElbowTests(unittest.TestCase):
    def test_the_balanced_set_demodulates_to_dc_at_every_tick(self):
        q, dq = 0.2, 0.0
        constant_q = []
        for _ in range(400):
            tau = -12.0 * q - 0.35 * dq
            q, dq = plant.step_arm((0.0, q, 0.0, dq), (0.0, tau), dist=(0.0, 0.0),
                                   dt=plant.DT, gravity=False)[1::2]
            ia = -10.0 * math.sin(q)
            ib = -10.0 * math.sin(q - 2.0 * math.pi / 3.0)
            ic = submission.third_phase(ia, ib)
            self.assertAlmostEqual(
                ia + ib + ic, 0.0, delta=1e-12,
                msg="expected the reconstructed third phase to close the balanced set exactly, so "
                    "the three currents sum to zero every tick; a residual means the sign or the "
                    "120 degree shift is wrong - check -ia - ib",
            )
            alpha, beta = submission.clarke(ia, ib)
            i_d, i_q = submission.park(alpha, beta, q)
            constant_q.append(i_q)
            self.assertAlmostEqual(
                i_d, 0.0, delta=1e-9,
                msg="expected the d-axis component to vanish at every tick, since the set was "
                    "built from this very angle; a nonzero i_d means the Park transform turned "
                    "the frame the wrong way - check the sign of theta",
            )
        self.assertLess(
            max(constant_q) - min(constant_q), 1e-9,
            msg="expected the quadrature current to stay constant while the joint moves, which is "
                "what a correctly aligned Park transform delivers; a ripple means the "
                "demodulation angle lags the signal - check it is the measured angle, not a "
                "delayed copy",
        )

    def test_the_third_current_is_the_elbows_own_balance(self):
        for q in (0.0, 0.4, 0.9, -1.3):
            ia = -10.0 * math.sin(q)
            ib = -10.0 * math.sin(q - 2.0 * math.pi / 3.0)
            ic = -10.0 * math.sin(q + 2.0 * math.pi / 3.0)
            self.assertAlmostEqual(
                submission.third_phase(ia, ib), ic, delta=1e-12,
                msg="expected the reconstructed third phase to match the balanced set at every "
                    "joint angle the loop covers, including the negative one; a mismatch means "
                    "the reconstruction is a fixed shift rather than a sum - check -ia - ib",
            )
            alpha, beta = submission.clarke(ia, ib)
            self.assertAlmostEqual(
                math.hypot(alpha, beta), 10.0, delta=1e-12,
                msg="expected the Clarke magnitude to stay at the set's 10 A amplitude at every "
                    "angle, the property that makes it a rotation rather than a projection; a "
                    "varying magnitude means a scaling factor is missing - check 2/3",
            )
            # The frame that demodulates it is the joint's own angle, wrapped like the encoder's.
            i_d, i_q = submission.park(alpha, beta, submission.wrap_pi(q))
            self.assertAlmostEqual(
                i_d, 0.0, delta=1e-9,
                msg="expected no d-axis current after wrapping the angle to +/- pi; a nonzero "
                    "value at the wrapped poses means the wrap was skipped and the trigonometric "
                    "identities drifted - check wrap_pi runs before the transform",
            )
            self.assertAlmostEqual(
                i_q, 10.0, delta=1e-9,
                msg="expected the quadrature current to read the set's full 10 A; a smaller value "
                    "means the amplitude was scaled by the Clarke factor twice - check both "
                    "transforms",
            )


class NoiseAveragingTests(unittest.TestCase):
    def test_averaging_the_plants_noise_follows_tau_minus_a_half(self):
        dt = 0.01
        sigma_density = 0.02  # rad/s per sqrt(Hz)
        samples = plant.add_noise([0.0] * 20000, sigma_density / math.sqrt(dt), seed=7)
        for window in (1, 4, 16):
            averaged = [sum(samples[i:i + window]) / window for i in range(0, len(samples), window)]
            measured = statistics.pstdev(averaged)
            predicted = submission.allan_deviation(sigma_density, window * dt * 1.0)
            self.assertLess(
                abs(measured - predicted), 0.12 * predicted,
                msg="expected averaging windows of 1, 4 and 16 samples to follow the tau^-1/2 law "
                    "to within 12 percent, measured against the plant's own seeded noise; a "
                    "larger gap means the density or the sample interval is off - check that a "
                    "longer window predicts a smaller spread",
            )


if __name__ == "__main__":
    unittest.main()
