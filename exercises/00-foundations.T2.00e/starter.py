"""Exercise 00-foundations.T2.00e - the learner's file.

A second-order mechanical system becomes a 2x2 first-order system, whose eigenvalues are its poles;
then two discretisations turn it into something a microcontroller can run. Fill the six TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T2.00e/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00e -p 'test_*.py'
"""

import cmath
import math

import mechalab_plant as plant


def companion_state_matrices(j, k, b):
    """(A, B) for J theta'' + b theta' + k theta = u, state [theta, theta'].

    B is a COLUMN, a list of rows: [[0.0], [1.0/J]] - the tests index B[1][0], so a flat
    [0.0, 1.0/J] comes back as "'float' object is not subscriptable".
    """
    raise NotImplementedError(
        "TODO 1: row one copies the angular velocity; row two is the stiffness and damping terms over the inertia"
    )


def eigvals_2x2(a):
    """The two eigenvalues of a 2x2, as a tuple of complex numbers."""
    raise NotImplementedError("TODO 2: trace and determinant, then cmath.sqrt of the discriminant")


def is_stable(a):
    """True when both eigenvalues have strictly negative real parts."""
    raise NotImplementedError("TODO 3: a marginal pole is not stable")


def discretize_euler(a, b, ts):
    """Forward Euler: Ad = I + A Ts, Bd = B Ts."""
    raise NotImplementedError("TODO 4: the simplest map, and the one that can leave the unit circle")


def discretize_tustin(a, b, ts):
    """Tustin: Ad = (I - Ts/2 A)^-1 (I + Ts/2 A), Bd = (I - Ts/2 A)^-1 B Ts."""
    raise NotImplementedError("TODO 5: invert the 2x2, do not divide it elementwise")


def simulate_discrete(ad, bd, x0, u, steps):
    """Iterate x_{k+1} = Ad x_k + Bd u with constant u; return the final state."""
    raise NotImplementedError("TODO 6: the loop a controller actually runs")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
