"""Exercise 03-sensors.T2.03a - the learner's file.

Two frames, one tracking loop and one noise law. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/03-sensors.T2.03a/starter.py \
        python3 -m unittest discover -s exercises/03-sensors.T2.03a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def wrap_pi(angle):
    """Wrap an angle into (-pi, pi]."""
    raise NotImplementedError("TODO 1: the angle brought into the signed range the loop uses")


def third_phase(i_a, i_b):
    """The third current, from the neutral point."""
    raise NotImplementedError("TODO 2: the third phase current, given that the three share a neutral")


def clarke(i_a, i_b):
    """Amplitude-invariant Clarke: (i_alpha, i_beta) from two phase currents."""
    raise NotImplementedError("TODO 3: the two stationary-frame currents this three-phase set makes")


def park(i_alpha, i_beta, theta_e):
    """(i_d, i_q) in the rotor frame."""
    raise NotImplementedError("TODO 4: the direct and quadrature currents in the rotor's own frame")


def inverse_park(i_d, i_q, theta_e):
    """(i_alpha, i_beta) back in the stationary frame."""
    raise NotImplementedError("TODO 5: the stationary-frame pair that corresponds to these rotor-frame currents")


def pll_step(theta_hat, omega_hat, theta_meas, kp, ki, dt):
    """One Type-II PLL step; returns (theta_hat, omega_hat)."""
    raise NotImplementedError("TODO 6: one loop step: the new angle estimate and the new speed estimate")


def allan_deviation(sigma_density, tau):
    """Rate standard deviation after averaging white noise for `tau` seconds."""
    raise NotImplementedError("TODO 7: the rate noise left after averaging for this long")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
