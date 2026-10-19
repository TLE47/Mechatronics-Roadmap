"""Planted fault: Nyquist reported as the sample rate.

The half is missing. Folding still works because the alias function reflects at its own boundary,
so only the Nyquist claim is wrong - which is exactly the number a course author sticks above an
ADC table.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def nyquist_hz(fs):
    if fs <= 0.0:
        raise ValueError("nyquist_hz: sample rate must be positive, got %r" % (fs,))
    return fs


def alias_hz(f_sig, fs):
    if fs <= 0.0:
        raise ValueError("alias_hz: sample rate must be positive, got %r" % (fs,))
    folded = math.fmod(abs(f_sig), fs)
    if folded > 0.5 * fs:
        folded = fs - folded
    return folded
