"""Exercise 05-control.T2.05a - the learner's file.

Margins, the sensitivity pair, Bryson's weights, an observer's error matrix and a discrete LQR
gain. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/05-control.T2.05a/starter.py \
        python3 -m unittest discover -s exercises/05-control.T2.05a -p 'test_*.py'
"""

import cmath
import math

import mechalab_plant as plant


def phase_margin_deg(loop):
    """Phase margin at a gain crossover, with the loop's lag unwrapped into (-360, 0]."""
    raise NotImplementedError("TODO 1: 180 + the phase in degrees, after unwrapping a positive angle")


def phase_loss_deg(omega_gc, tau_d):
    """Degrees of phase a transport delay eats at the gain crossover."""
    raise NotImplementedError("TODO 2: the delay angle is omega * tau, in radians -> degrees")


def st(loop):
    """`S = 1/(1+L)` and `T = L/(1+L)`; their sum is one at every frequency."""
    raise NotImplementedError("TODO 3: both share the denominator; T is not 1/S")


def gain_crossover(loop_fn, w_lo=1e-3, w_hi=1e4, iterations=200):
    """Bisect for the frequency where |L(jw)| = 1; raise ValueError when the bracket has no crossing."""
    raise NotImplementedError("TODO 4: check the bracket's signs first, then halve it")


def bryson_weights(x_max, u_max):
    """Bryson's rule: `Q_ii = 1/x_max_i^2`, `R = 1/u_max^2`."""
    raise NotImplementedError("TODO 5: squared, not linear - the units have to cancel")


def observer_spectral_radius(ad, c, l):
    """Spectral radius of `Ad - L C` (two states, one measurement)."""
    raise NotImplementedError("TODO 6: build Ad - L C, then its eigenvalues from trace and determinant")


def lqr_gain(ad, bd, q_diag, r):
    """Discrete LQR gain for `u = -K x`, from the Riccati fixed point."""
    raise NotImplementedError("TODO 7: iterate P <- A'PA - A'PB (R + B'PB)^-1 B'PA + Q to its fixed point")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
