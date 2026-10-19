"""Reference solution for 00-foundations.T2.00f - sampling and aliasing only."""

import math


def nyquist_hz(fs):
    """Half the sample rate."""
    if fs <= 0.0:
        raise ValueError("nyquist_hz: sample rate must be positive, got %r" % (fs,))
    return 0.5 * fs


def alias_hz(f_sig, fs):
    """Fold `f_sig` into [0, fs/2].

    `fmod` gives the remainder one fold down; a remainder past Nyquist is the mirror image of a
    frequency below it, so it is subtracted from fs.
    """
    if fs <= 0.0:
        raise ValueError("alias_hz: sample rate must be positive, got %r" % (fs,))
    folded = math.fmod(abs(f_sig), fs)
    if folded > 0.5 * fs:
        folded = fs - folded
    return folded
