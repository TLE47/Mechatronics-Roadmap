"""Exercise 05-control.T3.05a - reference solution.

One Tier 3 idea: keep a covariance matrix honest in floating point. The Joseph form is the
measurement update written as a sum of two squares, so it stays symmetric and positive even when
the gain is wrong; the NEES is the check that says whether the covariance told the truth.
"""

import math


def optimal_gain(p_minus, h, r):
    """The scalar Kalman gain K = P^- H / (H P^- H + R)."""
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if h <= 0.0:
        raise ValueError("a zero measurement Jacobian carries no information")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return p_minus * h / (h * p_minus * h + r)


def joseph_variance(p_minus, h, r, k):
    """P^+ = (1 - K H) P^- (1 - K H) + K R K: a sum of two squares, so never negative."""
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    a = 1.0 - k * h
    return a * a * p_minus + k * k * r


def nees_diagonal(error, variances):
    """NEES = e^T P^-1 e for a diagonal covariance: the sum of each error over its own variance."""
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))
