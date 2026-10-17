"""Planted fault: the Park transform rotates by +theta instead of -theta.

The matrix is still a rotation, still has determinant one, and still has the same magnitude at
every frequency - it simply tracks a frame turning the other way, so the quadrature current comes
out with the wrong sign.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def wrap_pi(angle):
    wrapped = math.fmod(angle + math.pi, 2.0 * math.pi)
    if wrapped <= 0.0:
        wrapped += 2.0 * math.pi
    return wrapped - math.pi


def third_phase(i_a, i_b):
    return -(i_a + i_b)


def clarke(i_a, i_b):
    return i_a, (i_a + 2.0 * i_b) / math.sqrt(3.0)


def park(i_alpha, i_beta, theta_e):
    c = math.cos(theta_e)
    s = math.sin(theta_e)
    return c * i_alpha - s * i_beta, s * i_alpha + c * i_beta


def inverse_park(i_d, i_q, theta_e):
    c = math.cos(theta_e)
    s = math.sin(theta_e)
    return c * i_d - s * i_q, s * i_d + c * i_q


def pll_step(theta_hat, omega_hat, theta_meas, kp, ki, dt):
    error = wrap_pi(theta_meas - theta_hat)
    omega_hat = omega_hat + ki * error * dt
    theta_hat = wrap_pi(theta_hat + (omega_hat + kp * error) * dt)
    return theta_hat, omega_hat


def allan_deviation(sigma_density, tau):
    return sigma_density / math.sqrt(tau)
