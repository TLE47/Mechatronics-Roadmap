"""Planted fault: phase returned in radians at a boundary that promises degrees.

-90 degrees becomes -1.5708. A Bode phase axis drawn from this is off by a factor of 57.3.
"""

from solution import *  # noqa: F401,F403
import cmath


def phase_deg(h):
    return cmath.phase(h)
