"""Planted fault: the series impedance computed as R + wL instead of R + jwL.

Correct at DC, where the reactance is zero, and wrong everywhere else: 3 ohm + 4 ohm of reactance
reads 7 ohm instead of 5, and the phase, which is the whole point of the complex form, disappears.
"""

from solution import *  # noqa: F401,F403


def impedance_rl(r_ohm, l_h, omega):
    return complex(r_ohm + omega * l_h, 0.0)
