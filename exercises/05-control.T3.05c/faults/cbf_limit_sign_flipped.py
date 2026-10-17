"""Planted fault: the barrier becomes a floor `u >= -alpha h` instead of a ceiling `u <= alpha h`.

With h = 0.05 rad and alpha = 6/s the faulty filter lifts a -0.40 rad/s retreat to -0.30 rad/s and
lets a +0.80 rad/s charge through untouched.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if u_min >= u_max:
        raise ValueError("the actuator bounds must leave an interval, not %r >= %r"
                         % (u_min, u_max))
    lower = max(u_min, -alpha * h_value)
    return min(max(u_nom, lower), u_max)


def barrier_lower_bound(h0, alpha, t):
    if h0 < 0.0:
        raise ValueError("the initial margin is a distance, so it cannot be negative")
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if t < 0.0:
        raise ValueError("time only runs forwards in this filter")
    return h0 * math.exp(-alpha * t)
