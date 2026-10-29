"""Exercise 00-foundations.T3.00a - the learner's file.

The hat map, its vee inverse, the rotation exponential and the power balance. Fill the six TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T3.00a/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T3.00a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def hat(w):
    """The 3x3 matrix that turns this vector into the equivalent cross-product operator."""
    raise NotImplementedError("TODO 1: the matrix whose action on any vector is the same as crossing with this one")


def vee(m):
    """Inverse of `hat`; raise ValueError when `m` is not skew-symmetric."""
    raise NotImplementedError("TODO 2: the vector that hat came from, refusing a matrix that is not skew-symmetric")


def mat3_mul(a, b):
    """The product of two 3x3 matrices."""
    raise NotImplementedError("TODO 3: the composition of the two matrices")


def mat3_vec(a, v):
    """Matrix times vector."""
    raise NotImplementedError("TODO 4: the vector this matrix produces")


def exp_so3(phi):
    """The rotation matrix for this rotation vector, however large its angle."""
    raise NotImplementedError("TODO 5: the rotation matrix this rotation vector describes, with a stable small-angle path")


def energy_rate(h_grad, x_dot, dissipation=0.0):
    """The rate at which the system's energy changes, with dissipation removed."""
    raise NotImplementedError("TODO 6: the rate the system's energy changes, with dissipation removed")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
