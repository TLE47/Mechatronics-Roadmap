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
    """Series R-L impedance, as a complex number in ohms.

    TODO 1: the resistor is the real part, the inductor is j*omega*L - add the hypotenuse, not
    R + omega*L.
    """
    raise NotImplementedError("TODO 1: R + j*w*L")


def first_order_response(tau, omega):
    """H(jw) of tau y' + y = u, evaluated at omega."""
    raise NotImplementedError("TODO 2: d/dt becomes j*omega")


def second_order_response(wn, zeta, omega):
    """G(jw) = wn^2 / ((jw)^2 + 2 zeta wn (jw) + wn^2)."""
    raise NotImplementedError("TODO 3: substitute s = j*omega and keep it complex")


def magnitude_db(h):
    """Amplitude in decibels: 20 log10 |h| - not 10 log10."""
    raise NotImplementedError("TODO 4: amplitude decibels")


def phase_deg(h):
    """Phase of h in degrees, in (-180, 180]."""
    raise NotImplementedError("TODO 5: degrees, not radians")


def resonance_peak(wn, zeta):
    """(omega_r, peak_magnitude) of the second-order magnitude.

    TODO 6: differentiate |G| and solve - omega_r = wn sqrt(1 - 2 zeta^2), peak =
    1 / (2 zeta sqrt(1 - zeta^2)) when zeta < 1/sqrt(2). Otherwise there is no peak: (0.0, 1.0).
    """
    raise NotImplementedError("TODO 6: where the peak is, and how tall")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
