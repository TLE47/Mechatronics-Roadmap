"""Planted fault: phase from `acos(real / |z|)`, which cannot go negative.

Correct in the upper half plane and wrong in the lower one: 1 - j should read -45 degrees and reads
+45 instead, which is the mirror image a Bode phase plot must not have.
"""

from solution import *  # noqa: F401,F403
import math


def to_polar(z):
    magnitude = abs(z)
    if magnitude == 0.0:
        return 0.0, 0.0
    return magnitude, math.acos(z.real / magnitude)
