"""Planted fault: the Joseph form keeps `K R K` and drops the prior term.

A zero gain is the case that exposes it: `K = 0` means no measurement was taken, so the posterior
must be the prior, 4.0. This line returns 0.0 - a filter that erases its own belief on every quiet
tick.

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
    # FAULT: the prior term is gone, so a zero gain wipes the covariance to zero.
    return k * k * r


def nees_diagonal(error, variances):
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))
