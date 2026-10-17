"""Planted fault: `prewarp_omega` returns the analog target frequency unchanged.

Without the tangent, feeding it to Tustin lands 100 Hz low at 850 Hz on a 4 kHz clock - the very
error pre-warping exists to remove.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def nyquist_hz(fs):
    return 0.5 * fs


def alias_hz(f_sig, fs):
    folded = math.fmod(abs(f_sig), fs)
    if folded > 0.5 * fs:
        folded = fs - folded
    return folded


def tustin_hz(omega_rad_s, fs):
    ts = 1.0 / fs
    return math.atan(omega_rad_s * ts / 2.0) / (math.pi * ts)


def prewarp_omega(f0_hz, fs):
    return 2.0 * math.pi * f0_hz


def notch_coeffs(f0_hz, fs, q):
    w0 = 2.0 * math.pi * f0_hz / fs
    alpha = math.sin(w0) / (2.0 * q)
    norm = 1.0 / (1.0 + alpha)
    b1 = -2.0 * math.cos(w0) * norm
    return (norm, b1, norm, b1, (1.0 - alpha) * norm)


def apply_biquad(coeffs, samples):
    b0, b1, b2, a1, a2 = coeffs
    w1 = 0.0
    w2 = 0.0
    out = []
    for x in samples:
        y = b0 * x + w1
        w1 = b1 * x - a1 * y + w2
        w2 = b2 * x - a2 * y
        out.append(y)
    return out


def covariance_propagate(a, sigma, q):
    asigma = [[sum(a[i][k] * sigma[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
    return [[sum(asigma[i][k] * a[j][k] for k in range(2)) + q[i][j] for j in range(2)]
            for i in range(2)]


def simulate_discrete(ad, bd, x0, u, steps):
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x
