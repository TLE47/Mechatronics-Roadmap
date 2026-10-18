"""Planted fault: the resonance value -10j, returned at every frequency.

Correct at the worked example's omega = omega_n and nowhere else: DC gain becomes -10j instead of 1,
and the phase is -90 degrees at frequencies where it should be 0.
"""

from solution import *  # noqa: F401,F403


def second_order_response(wn, zeta, omega):
    return -10.0j
