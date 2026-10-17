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
        self.assertLess(statistics.mean(pll_error), 0.35, "the PLL must recover the joint rate")
        self.assertLess(statistics.mean(pll_error), statistics.mean(diff_error),
                        "a PLL must beat a finite difference on the same quantized samples")


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
            self.assertAlmostEqual(ia + ib + ic, 0.0, delta=1e-12)
            alpha, beta = submission.clarke(ia, ib)
            i_d, i_q = submission.park(alpha, beta, q)
            constant_q.append(i_q)
            self.assertAlmostEqual(i_d, 0.0, delta=1e-9)
        self.assertLess(max(constant_q) - min(constant_q), 1e-9,
                        "i_q must be constant while the joint moves")

    def test_the_third_current_is_the_elbows_own_balance(self):
        for q in (0.0, 0.4, 0.9, -1.3):
            ia = -10.0 * math.sin(q)
            ib = -10.0 * math.sin(q - 2.0 * math.pi / 3.0)
            ic = -10.0 * math.sin(q + 2.0 * math.pi / 3.0)
            self.assertAlmostEqual(submission.third_phase(ia, ib), ic, delta=1e-12)
            alpha, beta = submission.clarke(ia, ib)
            self.assertAlmostEqual(math.hypot(alpha, beta), 10.0, delta=1e-12)
            # The frame that demodulates it is the joint's own angle, wrapped like the encoder's.
            i_d, i_q = submission.park(alpha, beta, submission.wrap_pi(q))
            self.assertAlmostEqual(i_d, 0.0, delta=1e-9)
            self.assertAlmostEqual(i_q, 10.0, delta=1e-9)


class NoiseAveragingTests(unittest.TestCase):
    def test_averaging_the_plants_noise_follows_tau_minus_a_half(self):
        dt = 0.01
        sigma_density = 0.02  # rad/s per sqrt(Hz)
        samples = plant.add_noise([0.0] * 20000, sigma_density / math.sqrt(dt), seed=7)
        for window in (1, 4, 16):
            averaged = [sum(samples[i:i + window]) / window for i in range(0, len(samples), window)]
            measured = statistics.pstdev(averaged)
            predicted = submission.allan_deviation(sigma_density, window * dt * 1.0)
            self.assertLess(abs(measured - predicted), 0.12 * predicted,
                            "window %d: measured %.5f vs predicted %.5f" % (window, measured, predicted))


if __name__ == "__main__":
    unittest.main()
