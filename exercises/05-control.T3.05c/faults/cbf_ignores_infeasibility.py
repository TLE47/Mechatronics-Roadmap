"""Planted fault: an infeasible barrier is clamped to `u_min` instead of being refused.

At h = -0.50 rad and alpha = 8/s the barrier needs u <= -4.0, which the +-2 rad/s actuator cannot
deliver; this returns -2.0 and pretends the constraint held.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if u_min >= u_max:
        raise ValueError("the actuator bounds must leave an interval, not %r >= %r"
                         % (u_min, u_max))
    upper = min(u_max, alpha * h_value)
    return min(max(u_nom, u_min), upper)


def barrier_lower_bound(h0, alpha, t):
    if h0 < 0.0:
        raise ValueError("the initial margin is a distance, so it cannot be negative")
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if t < 0.0:
        raise ValueError("time only runs forwards in this filter")
    return h0 * math.exp(-alpha * t)
