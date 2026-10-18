"""Planted fault: the resonance peak placed at omega_n with height 1/(2 zeta).

Exact as zeta -> 0, and wrong by 5% in location and height at zeta = 0.3. The consistency test asks
whether the reported peak is actually a point on the reported curve; this fault's is not.
"""

from solution import *  # noqa: F401,F403


def resonance_peak(wn, zeta):
    if zeta <= 0.0 or zeta >= 1.0 / (2.0 ** 0.5):
        return 0.0, 1.0
    return wn, 1.0 / (2.0 * zeta)
