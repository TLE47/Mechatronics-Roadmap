"""Exercise 00-foundations.T2.00d - reference solution.

One idea repeated: a derivative is multiplication by j*omega, so a differential equation becomes a
complex ratio, and that ratio carries both numbers a sine response has - amplitude and phase. The
resonance peak is the one place where the formula needs care: it is not at omega_n unless zeta is
zero, and it only exists above zeta = 1/sqrt(2) as a peak at all.
"""

import cmath
import math

import mechalab_plant as plant


def to_polar(z):
    """(magnitude, phase_rad)."""
    return abs(z), cmath.phase(z)


def to_rect(magnitude, phase_rad):
    """m e^{j phi}."""
    return cmath.rect(magnitude, phase_rad)


def first_order_response(tau, omega):
    """H(j omega) = 1 / (1 + j omega tau)."""
    return 1.0 / (1.0 + 1j * omega * tau)


def second_order_response(wn, zeta, omega):
    """G(j omega) for the canonical second-order system."""
    s = 1j * omega
    return (wn * wn) / (s * s + 2.0 * zeta * wn * s + wn * wn)


def magnitude_db(h):
    """20 log10 |h|."""
    return 20.0 * math.log10(abs(h))


def phase_deg(h):
    """Phase in degrees."""
    return math.degrees(cmath.phase(h))


def resonance_peak(wn, zeta):
    """(omega_r, peak) of |G|, or (0.0, 1.0) when the magnitude never peaks above 1."""
    if zeta <= 0.0 or zeta >= 1.0 / math.sqrt(2.0):
        return 0.0, 1.0
    root = math.sqrt(1.0 - 2.0 * zeta * zeta)
    return wn * root, 1.0 / (2.0 * zeta * math.sqrt(1.0 - zeta * zeta))


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
