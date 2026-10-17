"""Planted fault: damping ratio without its factor of 2.

`zeta = b / sqrt(J k)` instead of `b / (2 sqrt(J k))` reads half as damped as it is, which also
doubles the predicted overshoot. Passes at no pose in particular - only a changed plant shows it.
"""

from solution import *  # noqa: F401,F403
import math


def second_order_params(j, k, b):
    wn = math.sqrt(k / j)
    zeta = b / math.sqrt(j * k)
    if zeta >= 1.0:
        return {"wn": wn, "zeta": zeta, "wd": 0.0, "mp": 0.0}
    root = math.sqrt(1.0 - zeta * zeta)
    return {"wn": wn, "zeta": zeta, "wd": wn * root, "mp": math.exp(-math.pi * zeta / root)}
