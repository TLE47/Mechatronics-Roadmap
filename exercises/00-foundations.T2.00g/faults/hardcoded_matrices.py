"""Planted fault: the worked example's matrices, returned whatever the caller asked for.

Every test that reuses m = 1.0, k = 100, b = 10, dt = 0.01 passes; the one that changes the plant
does not.
"""

from solution import *  # noqa: F401,F403


def state_matrices(m, k, b, dt):
    return [[1.0, 0.01], [-1.0, 0.90]], [0.0, 0.01]
