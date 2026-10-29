"""Exercise 00-foundations.T2.00d - the learner's file.

Two numbers in one: a magnitude and an angle. Fill the three TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00d/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00d -p 'test_*.py'

Angles inside these helpers are radians. One helper reads a complex number; the other rebuilds one
from its size and direction, so callers never retype the trigonometry at each call site.
"""

import cmath
import math

import mechalab_plant as plant


def to_polar(z):
    """The size and direction of a complex number, as a pair.

    TODO 1: the size and the direction of this complex number.
    """
    raise NotImplementedError("TODO 1: the size and the direction of this complex number")


def to_rect(magnitude, phase_rad):
    """The complex number at this magnitude and angle.

    TODO 2: the complex number at this magnitude and angle, in radians.
    """
    raise NotImplementedError("TODO 2: the complex number at this magnitude and angle, in radians")


def add_phasors(z1, z2):
    """The phasor of the sinusoid the two components make together.

    TODO 3: the combined phasor, as one complex number.
    """
    raise NotImplementedError("TODO 3: the combined phasor, as one complex number")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
