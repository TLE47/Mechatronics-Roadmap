"""Planted fault: the CBF filter clips to the actuator bounds and never consults the barrier.

The 1.20 rad/s exercise command is returned untouched, straight into the 1.50 rad stop.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if u_min >= u_max:
        raise ValueError("the actuator bounds must leave an interval, not %r >= %r"
                         % (u_min, u_max))
    return min(max(u_nom, u_min), u_max)


def barrier_lower_bound(h0, alpha, t):
    if h0 < 0.0:
        raise ValueError("the initial margin is a distance, so it cannot be negative")
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if t < 0.0:
        raise ValueError("time only runs forwards in this filter")
    return h0 * math.exp(-alpha * t)
