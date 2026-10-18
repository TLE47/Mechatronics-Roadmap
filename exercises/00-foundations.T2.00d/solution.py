"""Exercise 00-foundations.T2.00d - reference solution.

A complex number is two numbers in one container: an amplitude and an angle. `to_polar` reads them
out, `to_rect` puts them back, and adding two of them is what adding two same-frequency sinusoids
does. Everything the later pages do with impedance and Bode plots is these three operations, run on
a ratio.
"""

import cmath
import math

import mechalab_plant as plant


def to_polar(z):
    """(magnitude, phase_rad) - Euler's formula, read backwards."""
    return abs(z), cmath.phase(z)


def to_rect(magnitude, phase_rad):
    """The complex number m e^{j phi}."""
    return cmath.rect(magnitude, phase_rad)


def add_phasors(z1, z2):
    """The phasor of the sum of two same-frequency sinusoids."""
    return z1 + z2


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
