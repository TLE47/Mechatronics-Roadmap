"""Planted fault: b_crit = 2 J k, the module's own "if your result differs" mistake.

At the worked numbers the correct answer is 0.80 and this returns 0.32 - a factor of 2.5 wrong, and
dimensionally wrong: J k has units of kg^2 m^2 / s^2, not N m s.
"""

from solution import *  # noqa: F401,F403


def critical_damping(j, k):
    return 2.0 * j * k
