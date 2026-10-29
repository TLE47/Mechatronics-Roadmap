"""Exercise 05-control.T3.05c - your implementation.

Two holes, one per idea the module promised: the CBF-QP projection that caps a velocity command at
`alpha h` inside the actuator interval, and the exponential margin it guarantees afterwards.

Fill each one in, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/05-control.T3.05c/starter.py \
      python3 -m unittest discover -s exercises/05-control.T3.05c -p 'test_*.py'
"""

import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    """The command after the safety limit and the actuator bounds, as close to the request as both allow.

    The safety limit is an upper bound on the command. Refuse an empty admissible interval instead
    of clamping to nonsense.
    """
    raise NotImplementedError(
        "cbf_command: the command after the safety limit and the actuator bounds, or a refusal when nothing is admissible"
    )


def barrier_lower_bound(h0, alpha, t):
    """The margin the barrier guarantees at this time; with no decay it stays at its starting value."""
    raise NotImplementedError("barrier_lower_bound: the margin the barrier guarantees at this time")
