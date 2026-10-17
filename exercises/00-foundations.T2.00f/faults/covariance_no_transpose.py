"""Planted fault: A Sigma A, without the transpose.

The result is still symmetric-looking in easy cases but wrong the moment A couples the states: the
cross-variance comes out 0.5 where the correct sandwich gives 0.4.
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
    ts = 1.0 / fs
    return (2.0 / ts) * math.tan(math.pi * f0_hz / fs)


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
    out = [[0.0, 0.0], [0.0, 0.0]]
    for i in range(2):
        for j in range(2):
            out[i][j] = sum(asigma[i][k] * a[k][j] for k in range(2)) + q[i][j]
    return out


def simulate_discrete(ad, bd, x0, u, steps):
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x
