"""Planted fault: adding phasors as magnitudes, discarding the phase.

Two equal and opposite sinusoids cancel; this returns amplitude 2 at phase 0. It is the mistake
that turns destructive interference into a doubled command.
"""

from solution import *  # noqa: F401,F403


def add_phasors(z1, z2):
    return complex(abs(z1) + abs(z2), 0.0)
