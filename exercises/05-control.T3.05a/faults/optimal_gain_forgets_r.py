"""Planted fault: the optimal gain divides by the prior term only, so K = 1/H = 1.0.

With P^- = 4, H = 1, R = 1 the module's gain is 0.8; this one reports a filter that trusts a noisy
sensor completely.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""


def optimal_gain(p_minus, h, r):
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if h <= 0.0:
        raise ValueError("a zero measurement Jacobian carries no information")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    # FAULT: R is missing from the denominator, so K collapses to 1/H.
    return p_minus * h / (h * p_minus * h)


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
    return sum(item * item / var for item, var in zip(e, v))
