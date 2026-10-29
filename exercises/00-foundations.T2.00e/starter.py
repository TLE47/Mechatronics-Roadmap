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
        "TODO 1: the state and input matrices for this spring-mass-damper"
    )


def eigvals_2x2(a):
    """The two eigenvalues of a 2x2, as a tuple of complex numbers."""
    raise NotImplementedError("TODO 2: the two eigenvalues of this matrix")


def is_stable(a):
    """True when both eigenvalues have strictly negative real parts."""
    raise NotImplementedError("TODO 3: whether both poles are strictly stable")


def discretize_euler(a, b, ts):
    """The forward-Euler state and input matrices for this step size."""
    raise NotImplementedError("TODO 4: the forward-Euler matrices for this step size")


def discretize_tustin(a, b, ts):
    """The Tustin state and input matrices for this step size."""
    raise NotImplementedError("TODO 5: the Tustin matrices for this step size, with the two-by-two inverse")


def simulate_discrete(ad, bd, x0, u, steps):
    """The final state after this many steps at a constant input."""
    raise NotImplementedError("TODO 6: the state the controller ends on after this many steps")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
