"""Exercise 03-sensors.T2.03a - reference solution.

Three frames and one tracking loop. The Clarke transform is amplitude-invariant, the Park transform
is a rotation whose determinant is one, and the PLL's residual must be wrapped before it is used:
an encoder that rolls over from 2*pi to 0 otherwise hands the loop a step it reads as a real
2*pi error, and the velocity estimate spikes exactly once per turn.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def wrap_pi(angle):
    """Wrap an angle into (-pi, pi]."""
    wrapped = math.fmod(angle + math.pi, 2.0 * math.pi)
    if wrapped <= 0.0:
        wrapped += 2.0 * math.pi
    return wrapped - math.pi


def third_phase(i_a, i_b):
    """The neutral star point forces `i_c = -(i_a + i_b)`."""
    return -(i_a + i_b)


def clarke(i_a, i_b):
    """Amplitude-invariant Clarke: (i_alpha, i_beta) from two phase currents."""
    return i_a, (i_a + 2.0 * i_b) / math.sqrt(3.0)


def park(i_alpha, i_beta, theta_e):
    """Rotate the stationary frame onto the rotor: the inverse of the rotor's own rotation."""
    c = math.cos(theta_e)
    s = math.sin(theta_e)
    return c * i_alpha + s * i_beta, -s * i_alpha + c * i_beta


def inverse_park(i_d, i_q, theta_e):
    """(i_alpha, i_beta) from the rotor frame - Park's transpose, since it is a rotation."""
    c = math.cos(theta_e)
    s = math.sin(theta_e)
    return c * i_d - s * i_q, s * i_d + c * i_q


def pll_step(theta_hat, omega_hat, theta_meas, kp, ki, dt):
    """One Type-II tracking-loop step; returns (theta_hat, omega_hat) after `dt`.

    The residual is wrapped: the measurement and the estimate live on a circle, and their plain
    difference jumps by 2*pi at the rollover.
    """
    error = wrap_pi(theta_meas - theta_hat)
    omega_hat = omega_hat + ki * error * dt
    theta_hat = wrap_pi(theta_hat + (omega_hat + kp * error) * dt)
    return theta_hat, omega_hat


def allan_deviation(sigma_density, tau):
    """Rate standard deviation after averaging white noise of density `sigma_density` for `tau`."""
    if tau <= 0.0:
        raise ValueError("averaging window must be positive")
    return sigma_density / math.sqrt(tau)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
