"""Planted fault: the textbook subtraction `(1 - K H) P^-` in place of the Joseph form.

At the optimal gain the two agree, which is why the worked example would not catch it. At the
corrupted gain of 1.5 the subtraction returns -2.0 while the Joseph form returns 3.25.

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
    # FAULT: the squared Joseph form became the naive (1 - K H) subtraction.
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return (1.0 - k * h) * p_minus


def nees_diagonal(error, variances):
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))
