"""Exercise 03-sensors.T2.03a - the learner's file.

Two frames, one tracking loop and one noise law. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/03-sensors.T2.03a/starter.py \
        python3 -m unittest discover -s exercises/03-sensors.T2.03a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def wrap_pi(angle):
    """Wrap an angle into (-pi, pi]."""
    raise NotImplementedError("TODO 1: fmod into one turn, then shift by pi")


def third_phase(i_a, i_b):
    """The third current, from the neutral point."""
    raise NotImplementedError("TODO 2: Kirchhoff, not 120 degrees of phase")


def clarke(i_a, i_b):
    """Amplitude-invariant Clarke: (i_alpha, i_beta) from two phase currents."""
    raise NotImplementedError("TODO 3: the first axis is one phase; the second is the two phases that straddle it, over the root of three")


def park(i_alpha, i_beta, theta_e):
    """(i_d, i_q) in the rotor frame."""
    raise NotImplementedError("TODO 4: rotate the stationary pair into the rotor frame by minus the rotor angle — the direct axis is the projection along it, quadrature across it")


def inverse_park(i_d, i_q, theta_e):
    """(i_alpha, i_beta) back in the stationary frame."""
    raise NotImplementedError("TODO 5: the transpose of the Park rotation")


def pll_step(theta_hat, omega_hat, theta_meas, kp, ki, dt):
    """One Type-II PLL step; returns (theta_hat, omega_hat)."""
    raise NotImplementedError("TODO 6: wrap the residual BEFORE the gains; ki integrates it")


def allan_deviation(sigma_density, tau):
    """Rate standard deviation after averaging white noise for `tau` seconds."""
    raise NotImplementedError("TODO 7: the law is the density over the square root of the averaging time, not over the time itself")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
