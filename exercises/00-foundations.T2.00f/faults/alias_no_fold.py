"""Planted fault: nothing is folded at all.

The signal frequency is handed straight back, so a 3150 Hz tone at 4 kHz reports 3150 Hz and a
9000 Hz tone reports 9000 Hz. Below Nyquist every example still looks correct.
"""

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def nyquist_hz(fs):
    if fs <= 0.0:
        raise ValueError("nyquist_hz: sample rate must be positive, got %r" % (fs,))
    return 0.5 * fs


def alias_hz(f_sig, fs):
    if fs <= 0.0:
        raise ValueError("alias_hz: sample rate must be positive, got %r" % (fs,))
    return abs(f_sig)
