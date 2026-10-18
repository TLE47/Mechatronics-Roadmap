"""Planted fault: power decibels (10 log10) where amplitude decibels (20 log10) belong.

The module's own "if your result differs" note: a 3 dB cutoff then reads -1.5 dB, and a 10x gain
reads +10 dB instead of +20 dB.
"""

from solution import *  # noqa: F401,F403
import math


def magnitude_db(h):
    return 10.0 * math.log10(abs(h))
