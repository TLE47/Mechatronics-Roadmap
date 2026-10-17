"""Exercise 05-control.T3.05c - reference solution.

One Tier 3 tool: the 1D Control Barrier Function QP. It projects a nominal velocity command onto
the half-space the barrier allows, `u <= alpha h`, inside the actuator interval, and it does so
minimally - a command that already keeps the joint safe comes back untouched.
"""

import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    """The CBF-QP's closed form for `hdot = -u`: u <= alpha * h, clipped to the actuator bounds.

    The constraint is `hdot + alpha h >= 0`; with `hdot = -u` it is `u <= alpha h`. When the
    nominal command already satisfies it the projection returns it unchanged - that is what
    "minimally invasive" means.
    """
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if u_min >= u_max:
        raise ValueError("the actuator bounds must leave an interval, not %r >= %r"
                         % (u_min, u_max))
    upper = min(u_max, alpha * h_value)
    if upper < u_min:
        raise ValueError("infeasible: the barrier allows at most %r, below u_min %r"
                         % (upper, u_min))
    return min(max(u_nom, u_min), upper)


def barrier_lower_bound(h0, alpha, t):
    """The guaranteed margin h(t) >= h0 exp(-alpha t) under the CBF condition, in the same unit."""
    if h0 < 0.0:
        raise ValueError("the initial margin is a distance, so it cannot be negative")
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if t < 0.0:
        raise ValueError("time only runs forwards in this filter")
    return h0 * math.exp(-alpha * t)
