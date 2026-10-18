"""Exercise 00-foundations.T2.00d - the learner's file.

Two numbers in one: a magnitude and an angle. Fill the three TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00d/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00d -p 'test_*.py'

Angles inside these helpers are radians. `to_polar` is `abs` + `cmath.phase`; `to_rect` is Euler's
formula, not a cos/sin pair retyped at every call site.
"""

import cmath
import math

import mechalab_plant as plant


def to_polar(z):
    """(magnitude, phase_rad) of a complex number - Euler's formula, read backwards.

    TODO 1: `abs(z)` and `cmath.phase(z)`, with no quadrant fix-ups - the phase function already
    knows which quadrant it is in.
    """
    raise NotImplementedError("TODO 1: abs and cmath.phase")


def to_rect(magnitude, phase_rad):
    """The complex number with that magnitude and phase, m e^{j phi}.

    TODO 2: Euler's formula, in radians.
    """
    raise NotImplementedError("TODO 2: cmath.rect, or magnitude * (cos + j sin)")


def add_phasors(z1, z2):
    """The phasor of the sum of two same-frequency sinusoids.

    TODO 3: add the complex numbers, not their magnitudes.
    """
    raise NotImplementedError("TODO 3: complex addition")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
