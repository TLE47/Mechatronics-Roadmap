"""Planted fault: the Joseph form keeps the prior term and drops `K R K`.

The worked posterior is (0.2)^2 * 4 + 0.8^2 * 1 = 0.80; dropping the second square returns 0.16,
so a filter with this line believes a noisy sensor bought it nothing.

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
    # FAULT: the K R K term is gone, so only the prior survives the update.
    return a * a * p_minus


def nees_diagonal(error, variances):
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))
