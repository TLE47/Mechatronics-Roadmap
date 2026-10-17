"""Planted fault: overshoot as exp(-pi zeta), dropping the sqrt(1 - zeta^2).

At zeta = 0.5 the two differ by under 3%, which is why the worked example alone cannot catch it.
At zeta = 0.3 they differ by 5%.
"""

from solution import *  # noqa: F401,F403
import math


def second_order_params(j, k, b):
    wn = math.sqrt(k / j)
    zeta = b / (2.0 * math.sqrt(j * k))
    if zeta >= 1.0:
        return {"wn": wn, "zeta": zeta, "wd": 0.0, "mp": 0.0}
    return {"wn": wn, "zeta": zeta,
            "wd": wn * math.sqrt(1.0 - zeta * zeta),
            "mp": math.exp(-math.pi * zeta)}
