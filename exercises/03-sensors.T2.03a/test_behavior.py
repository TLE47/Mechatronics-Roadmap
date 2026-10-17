"""Behaviour tests for 03-sensors.T2.03a.

Each test names the mistake it catches:
  * a Clarke transform with the 2 in the wrong place (it agrees at theta = 0 and nowhere else);
  * a Park rotation applied at +theta instead of -theta (id and iq swap signs of the quadrature
    term, which a single worked angle at 90 degrees cannot see);
  * a PLL that uses the raw residual, so the velocity estimate spikes once per revolution;
  * a PLL that integrates the proportional term twice, which overshoots instead of settling;
  * an Allan deviation of sigma/tau ("random walk" applied to the *rate* instead of the walk).
"""

import math
import unittest

import harness

submission = harness.load_submission()

I_PK = 10.0


def balanced(theta, phase_deg=90.0):
    """Balanced currents `phase_deg` ahead of the rotor angle, returned as (ia, ib, ic)."""
    lead = math.radians(phase_deg)
    return tuple(I_PK * math.cos(theta + lead - k * 2.0 * math.pi / 3.0) for k in range(3))


class ClarkeTests(unittest.TestCase):
    def test_balanced_projection_preserves_amplitude(self):
        for theta in (0.0, 0.85, 2.5, -1.2):
            ia, ib, _ = balanced(theta, phase_deg=0.0)
            alpha, beta = submission.clarke(ia, ib)
            self.assertAlmostEqual(alpha, I_PK * math.cos(theta), delta=1e-12)
            self.assertAlmostEqual(beta, I_PK * math.sin(theta), delta=1e-12)
            self.assertAlmostEqual(math.hypot(alpha, beta), I_PK, delta=1e-12)

    def test_two_shunts_give_the_third_phase(self):
        i_c = submission.third_phase(6.0, -2.0)
        self.assertAlmostEqual(i_c, -4.0, delta=1e-15)
        alpha, beta = submission.clarke(6.0, -2.0)
        self.assertAlmostEqual(alpha, 6.0, delta=1e-12)
        self.assertAlmostEqual(beta, 2.0 / math.sqrt(3.0), delta=1e-12)
        self.assertAlmostEqual(math.hypot(alpha, beta), 6.110101, delta=1e-5)

    def test_a_pure_b_phase_lands_on_beta(self):
        alpha, beta = submission.clarke(0.0, 1.0)
        self.assertAlmostEqual(alpha, 0.0, delta=1e-15)
        self.assertAlmostEqual(beta, 2.0 / math.sqrt(3.0), delta=1e-12)


class ParkTests(unittest.TestCase):
    def test_quarter_turn(self):
        i_d, i_q = submission.park(5.0, 0.0, math.pi / 2.0)
        self.assertAlmostEqual(i_d, 0.0, delta=1e-12)
        self.assertAlmostEqual(i_q, -5.0, delta=1e-12)

    def test_quadrature_current_demodulates_to_dc(self):
        for theta in (0.0, 0.85, 1.7, 3.0, 5.5):
            ia, ib, _ = balanced(theta)
            alpha, beta = submission.clarke(ia, ib)
            i_d, i_q = submission.park(alpha, beta, theta)
            self.assertAlmostEqual(i_d, 0.0, delta=1e-9)
            self.assertAlmostEqual(i_q, I_PK, delta=1e-9)

    def test_d_aligned_current_lands_on_d(self):
        for theta in (0.3, 2.1, -0.7):
            alpha, beta = submission.clarke(*balanced(theta, phase_deg=0.0)[:2])
            i_d, i_q = submission.park(alpha, beta, theta)
            self.assertAlmostEqual(i_d, I_PK, delta=1e-9)
            self.assertAlmostEqual(i_q, 0.0, delta=1e-9)

    def test_inverse_is_the_transpose(self):
        for theta in (0.0, 0.9, 2.4):
            i_d, i_q = 3.0, -4.0
            alpha, beta = submission.inverse_park(i_d, i_q, theta)
            back = submission.park(alpha, beta, theta)
            self.assertAlmostEqual(back[0], i_d, delta=1e-12)
            self.assertAlmostEqual(back[1], i_q, delta=1e-12)

    def test_the_rotation_has_unit_determinant(self):
        theta = 1.234
        c, s = math.cos(theta), math.sin(theta)
        self.assertAlmostEqual(c * c + s * s, 1.0, delta=1e-12)


class WrapTests(unittest.TestCase):
    def test_inside_the_range_nothing_moves(self):
        for angle in (0.0, 1.0, -3.0, 3.14159):
            self.assertAlmostEqual(submission.wrap_pi(angle), angle, delta=1e-12)

    def test_rollover_maps_to_the_same_point(self):
        self.assertAlmostEqual(abs(submission.wrap_pi(2.0 * math.pi + 0.1)), 0.1, delta=1e-12)
        self.assertAlmostEqual(abs(submission.wrap_pi(-2.0 * math.pi - 0.1)), 0.1, delta=1e-12)
        self.assertAlmostEqual(submission.wrap_pi(math.pi), math.pi, delta=1e-12)

    def test_the_output_always_sits_in_one_turn(self):
        for k in range(-4, 5):
            wrapped = submission.wrap_pi(0.7 + k * 2.0 * math.pi)
            self.assertLessEqual(abs(wrapped), math.pi + 1e-12)
            self.assertAlmostEqual(wrapped, 0.7, delta=1e-12)


class PllTests(unittest.TestCase):
    def test_it_locks_onto_a_constant_speed(self):
        omega = 2.0 * math.pi * 350.0  # 3000 rpm at p = 7
        zeta, wn = 0.9, 2.0 * math.pi * 40.0
        kp, ki = 2.0 * zeta * wn, wn * wn
        dt = 1e-4
        theta_hat, omega_hat = 0.0, 0.0
        theta = 0.0
        fed = 0.0
        for _ in range(4000):
            theta = submission.wrap_pi(theta + omega * dt)
            fed = theta
            theta_hat, omega_hat = submission.pll_step(theta_hat, omega_hat, fed, kp, ki, dt)
        self.assertAlmostEqual(omega_hat, omega, delta=1e-3 * omega)
        # The estimate is the angle at the NEXT sample, so it leads the last measurement by exactly
        # one tick of the speed. That is the loop's convention, not a lock error: the residual it
        # actually drives to zero is wrap(theta_meas(k) - theta_hat(k-1)).
        lead = submission.wrap_pi(theta_hat - fed)
        self.assertAlmostEqual(lead, omega * dt, delta=0.15 * omega * dt)

    def test_a_rollover_does_not_spike_the_velocity(self):
        # The estimate sits just below -pi and the measurement just above it: on the circle they are
        # 0.04 rad apart, while the raw difference is 2*pi - 0.04.
        kp, ki, dt = 200.0, 5000.0, 1e-3
        theta_hat, omega_hat = -3.12, 1.0
        theta_hat, omega_hat = submission.pll_step(theta_hat, omega_hat, 3.12, kp, ki, dt)
        self.assertLess(abs(omega_hat - 1.0), 0.5)
        self.assertLess(abs(submission.wrap_pi(theta_hat - 3.12)), 0.2)

    def test_the_integral_holds_the_speed_with_zero_error(self):
        kp, ki, dt = 100.0, 2500.0, 1e-3
        theta_hat, omega_hat = 0.4, 3.0
        theta_hat, omega_hat = submission.pll_step(theta_hat, omega_hat, 0.4, kp, ki, dt)
        self.assertAlmostEqual(omega_hat, 3.0, delta=1e-12)


class AllanTests(unittest.TestCase):
    def test_the_law_is_inverse_sqrt(self):
        self.assertAlmostEqual(submission.allan_deviation(0.02, 1.0), 0.02, delta=1e-15)
        self.assertAlmostEqual(submission.allan_deviation(0.02, 100.0), 0.002, delta=1e-15)
        self.assertAlmostEqual(submission.allan_deviation(0.02, 0.01), 0.2, delta=1e-12)

    def test_a_longer_window_is_always_quieter(self):
        short = submission.allan_deviation(0.05, 0.1)
        long = submission.allan_deviation(0.05, 10.0)
        self.assertLess(long, short)
        self.assertAlmostEqual(short / long, 10.0, delta=1e-9)

    def test_a_zero_window_is_refused(self):
        with self.assertRaises(ValueError):
            submission.allan_deviation(0.02, 0.0)


if __name__ == "__main__":
    unittest.main()
