"""Planted fault: the alias folds once and forgets the mirror.

`fmod` alone leaves frequencies between fs/2 and fs where they are, so a 3150 Hz tone at 4 kHz
still reports 3150 Hz - outside the range the sampler can represent.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def nyquist_hz(fs):
    if fs <= 0.0:
        raise ValueError("nyquist_hz: sample rate must be positive, got %r" % (fs,))
    return 0.5 * fs


def alias_hz(f_sig, fs):
    if fs <= 0.0:
        raise ValueError("alias_hz: sample rate must be positive, got %r" % (fs,))
    return math.fmod(abs(f_sig), fs)
