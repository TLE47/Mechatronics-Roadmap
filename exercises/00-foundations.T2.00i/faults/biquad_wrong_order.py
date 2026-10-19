"""Planted fault: the biquad feeds the input back instead of the output.

This is TDF-I arithmetic inside a TDF-II frame. For a slow signal it barely shows; at the notch
frequency the feedback is the whole point, so the null is replaced by a shallow dip.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def tustin_hz(omega_rad_s, fs):
    if fs <= 0.0:
        raise ValueError("tustin_hz: sample rate must be positive, got %r" % (fs,))
    ts = 1.0 / fs
    return math.atan(omega_rad_s * ts / 2.0) / (math.pi * ts)


def prewarp_omega(f0_hz, fs):
    if fs <= 0.0:
        raise ValueError("prewarp_omega: sample rate must be positive, got %r" % (fs,))
    if not 0.0 <= f0_hz < 0.5 * fs:
        raise ValueError("prewarp_omega: target must lie in [0, fs/2), got %r" % (f0_hz,))
    ts = 1.0 / fs
    return (2.0 / ts) * math.tan(math.pi * f0_hz / fs)


def notch_coeffs(f0_hz, fs, q):
    if fs <= 0.0:
        raise ValueError("notch_coeffs: sample rate must be positive, got %r" % (fs,))
    if not 0.0 < f0_hz < 0.5 * fs:
        raise ValueError("notch_coeffs: notch must lie in (0, fs/2), got %r" % (f0_hz,))
    if q <= 0.0:
        raise ValueError("notch_coeffs: quality factor must be positive, got %r" % (q,))
    w0 = 2.0 * math.pi * f0_hz / fs
    alpha = math.sin(w0) / (2.0 * q)
    norm = 1.0 / (1.0 + alpha)
    b0 = norm
    b1 = -2.0 * math.cos(w0) * norm
    return (b0, b1, b0, b1, (1.0 - alpha) * norm)


def apply_biquad(coeffs, samples):
    if len(coeffs) != 5:
        raise ValueError("apply_biquad: expected 5 coefficients, got %d" % (len(coeffs),))
    b0, b1, b2, a1, a2 = coeffs
    w1 = 0.0
    w2 = 0.0
    out = []
    for x in samples:
        y = b0 * x + w1
        w1 = b1 * x - a1 * x + w2
        w2 = b2 * x - a2 * x
        out.append(y)
    return out
