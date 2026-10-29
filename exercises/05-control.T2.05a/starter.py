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
    raise NotImplementedError("TODO 1: the margin at the gain crossover, with any lag past a full turn unwrapped")


def phase_loss_deg(omega_gc, tau_d):
    """Degrees of phase a transport delay eats at the gain crossover."""
    raise NotImplementedError("TODO 2: the phase the transport delay eats at the gain crossover, in degrees")


def st(loop):
    """The sensitivity and complementary sensitivity at this frequency."""
    raise NotImplementedError("TODO 3: the sensitivity pair at this frequency")


def gain_crossover(loop_fn, w_lo=1e-3, w_hi=1e4, iterations=200):
    """The frequency where the loop's magnitude reaches unity; ValueError when it never does."""
    raise NotImplementedError("TODO 4: the frequency where the loop's magnitude crosses unity, or a refusal when it never does")


def bryson_weights(x_max, u_max):
    """The state and input weights Bryson's rule assigns to these limits."""
    raise NotImplementedError("TODO 5: the state and input weights Bryson's rule assigns to these limits")


def observer_spectral_radius(ad, c, l):
    """The spectral radius of the observer's error dynamics (two states, one measurement)."""
    raise NotImplementedError(
        "TODO 6: the spectral radius of the observer's error dynamics"
    )


def lqr_gain(ad, bd, q_diag, r):
    """The discrete LQR gain for `u = -K x`."""
    raise NotImplementedError(
        "TODO 7: the gain the discrete Riccati solution gives this plant"
    )


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
