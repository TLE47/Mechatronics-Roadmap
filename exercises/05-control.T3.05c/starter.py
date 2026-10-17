"""Exercise 05-control.T3.05c - your implementation.

Two holes, one per idea the module promised: the CBF-QP projection that caps a velocity command at
`alpha h` inside the actuator interval, and the exponential margin it guarantees afterwards.

Fill each one in, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/05-control.T3.05c/starter.py \
      python3 -m unittest discover -s exercises/05-control.T3.05c -p 'test_*.py'
"""

import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    """Project u_nom onto `u <= alpha * h` and the actuator bounds, minimally.

    Hint: `hdot = -u`, so the CBF inequality `hdot + alpha h >= 0` caps the command, it does not
    floor it. Refuse an empty admissible interval instead of clamping to nonsense.
    """
    raise NotImplementedError("cbf_command: upper = min(u_max, alpha * h_value), then clip")


def barrier_lower_bound(h0, alpha, t):
    """The guaranteed margin h0 exp(-alpha t). Hint: no alpha means a straight horizontal line."""
    raise NotImplementedError("barrier_lower_bound: h0 * math.exp(-alpha * t)")
