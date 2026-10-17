"""Exercise 00-foundations.T3.00a - the learner's file.

The hat map, its vee inverse, the rotation exponential and the power balance. Fill the six TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T3.00a/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T3.00a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def hat(w):
    """The 3x3 skew matrix with `[w]_x v == w x v`."""
    raise NotImplementedError("TODO 1: rows [0, -wz, wy], [wz, 0, -wx], [-wy, wx, 0]")


def vee(m):
    """Inverse of `hat`; raise ValueError when `m` is not skew-symmetric."""
    raise NotImplementedError("TODO 2: read the three entries, but only after checking the symmetry")


def mat3_mul(a, b):
    """Row-by-column product of two 3x3 matrices."""
    raise NotImplementedError("TODO 3: `a[i][k] * b[k][j]` summed over k, not a Hadamard product")


def mat3_vec(a, v):
    """Matrix times vector."""
    raise NotImplementedError("TODO 4: one row at a time")


def exp_so3(phi):
    """`exp([phi]_x)` by Rodrigues' formula, for a rotation vector of any length."""
    raise NotImplementedError("TODO 5: I + (sin t / t) K + ((1 - cos t) / t^2) K^2, "
                              "with a Taylor branch below t = 1e-7")


def energy_rate(h_grad, x_dot, dissipation=0.0):
    """Power balance `dH/dt = grad(H) . x_dot - dissipation`."""
    raise NotImplementedError("TODO 6: a dot product, with the dissipation subtracted")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
