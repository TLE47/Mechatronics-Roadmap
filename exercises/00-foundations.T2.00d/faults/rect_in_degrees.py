"""Planted fault: `to_rect` treats its radians argument as degrees.

`to_rect(1, pi)` should land on -1 and lands a fraction of a degree around +1 instead. Every
conversion through this function is off by a factor of 57.3.
"""

from solution import *  # noqa: F401,F403
import cmath
import math


def to_rect(magnitude, phase_rad):
    return cmath.rect(magnitude, math.radians(phase_rad))
