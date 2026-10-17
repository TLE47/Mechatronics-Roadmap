"""Planted fault: the cross product computed as b x a.

Every magnitude is right, the worked example is 180 degrees wrong, and orthogonality still holds -
which is exactly why a single-example check cannot catch it.
"""

from solution import *  # noqa: F401,F403
import solution


def cross3(a, b):
    return solution.cross3(b, a)


def moment(lever, force):
    # `solution.moment` would call `solution.cross3`, so the operator has to be overridden too -
    # otherwise this file's `cross3` is dead code and the fault is not actually injected.
    return solution.cross3(force, lever)
