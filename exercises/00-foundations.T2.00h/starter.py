"""Exercise 00-foundations.T2.00h - the learner's file.

A sine goes in, a sine comes out: same frequency, different amplitude, shifted in time. Substituting
`s = j*omega` turns the differential equation into a complex ratio, and that ratio carries both
numbers a sine response has. Fill the six TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00h/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00h -p 'test_*.py'

Angles are radians inside the complex helpers and degrees at the Bode boundary; decibels are
amplitude decibels, 20 log10 |H|.
"""

import cmath
import math

import mechalab_plant as plant


def impedance_rl(r_ohm, l_h, omega):
    """Series R-L impedance, as a complex number in ohms."""
    raise NotImplementedError("TODO 1: the impedance of this resistor and inductor at this frequency")


def first_order_response(tau, omega):
    """The frequency response of the first-order lag at this frequency."""
    raise NotImplementedError("TODO 2: what the lag does to a sine at this frequency, as a complex ratio")


def second_order_response(wn, zeta, omega):
    """The frequency response of the second-order system at this frequency."""
    raise NotImplementedError("TODO 3: the second-order response at this frequency, as a complex ratio")


def magnitude_db(h):
    """The amplitude in decibels, as a Bode plot's vertical axis shows it."""
    raise NotImplementedError("TODO 4: the amplitude on the decibel scale a Bode plot uses")


def phase_deg(h):
    """Phase of h in degrees, in (-180, 180]."""
    raise NotImplementedError("TODO 5: the angle of this response in degrees")


def resonance_peak(wn, zeta):
    """Where the second-order response peaks, and how tall the peak gets."""
    raise NotImplementedError("TODO 6: where the response peaks, and how tall the peak is; no peak reports zero and one")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
