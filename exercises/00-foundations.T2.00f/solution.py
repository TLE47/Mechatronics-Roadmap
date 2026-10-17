"""Exercise 00-foundations.T2.00f - reference solution.

Sampling folds, Tustin warps, and covariance propagation is the same sandwich rule at every step.
The pre-warp is exactly the inverse of the warping map, which is why the round trip in the tests is
an identity and not an approximation.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def nyquist_hz(fs):
    """Half the sample rate."""
    return 0.5 * fs


def alias_hz(f_sig, fs):
    """Fold `f_sig` into [0, fs/2].

    `fmod` gives the remainder one fold down; a remainder past Nyquist is the mirror image of a
    frequency below it, so it is subtracted from fs.
    """
    folded = math.fmod(abs(f_sig), fs)
    if folded > 0.5 * fs:
        folded = fs - folded
    return folded


def tustin_hz(omega_rad_s, fs):
    """`s = j omega` maps to `z = e^{j theta}` with `theta = 2 atan(omega Ts / 2)`."""
    ts = 1.0 / fs
    return math.atan(omega_rad_s * ts / 2.0) / (math.pi * ts)


def prewarp_omega(f0_hz, fs):
    """Inverse of `tustin_hz` at f0: the analog frequency Tustin must be handed."""
    ts = 1.0 / fs
    return (2.0 / ts) * math.tan(math.pi * f0_hz / fs)


def notch_coeffs(f0_hz, fs, q):
    """Notch with zeros on the unit circle at e^{+-j w0}: a true null at f0, unity at DC."""
    w0 = 2.0 * math.pi * f0_hz / fs
    alpha = math.sin(w0) / (2.0 * q)
    norm = 1.0 / (1.0 + alpha)
    b0 = norm
    b1 = -2.0 * math.cos(w0) * norm
    a1 = b1
    a2 = (1.0 - alpha) * norm
    return (b0, b1, b0, a1, a2)


def apply_biquad(coeffs, samples):
    """Transposed Direct Form II, a0 normalized to 1."""
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
    """Sigma' = A Sigma A^T + Q."""
    asigma = [[sum(a[i][k] * sigma[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
    out = [[0.0, 0.0], [0.0, 0.0]]
    for i in range(2):
        for j in range(2):
            out[i][j] = sum(asigma[i][k] * a[j][k] for k in range(2)) + q[i][j]
    return out


def simulate_discrete(ad, bd, x0, u, steps):
    """Kept from 00e: iterate x_{k+1} = Ad x_k + Bd u with a constant u."""
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
