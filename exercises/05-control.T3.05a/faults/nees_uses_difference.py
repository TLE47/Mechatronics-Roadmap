"""Planted fault: the NEES subtracts each variance from its error instead of dividing by it.

The gate-test NEES for `[0.20, 0, 0]` against variances `0.04` is `1.0`; this line returns
`0.20 - 0.04 = 0.16`, and it would report a healthy filter for a wildly overconfident one.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""


def optimal_gain(p_minus, h, r):
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if h <= 0.0:
        raise ValueError("a zero measurement Jacobian carries no information")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return p_minus * h / (h * p_minus * h + r)


def joseph_variance(p_minus, h, r, k):
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    a = 1.0 - k * h
    return a * a * p_minus + k * k * r


def nees_diagonal(error, variances):
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    # FAULT: scaled by a difference instead of normalised by the variance.
    return sum(abs(item) - var for item, var in zip(e, v))
