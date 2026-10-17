"""Exercise 05-control.T3.05a - your implementation.

Three holes, one idea: the measurement update that keeps a covariance honest. The Joseph form is
the textbook subtraction rewritten as a sum of two squares, so a corrupted gain cannot drive the
variance negative; the optimal gain is the Riccati solution for one scalar measurement; and the
NEES is how you find out whether the covariance you published was the truth.

Fill each one in, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/05-control.T3.05a/starter.py \\
      python3 -m unittest discover -s exercises/05-control.T3.05a -p 'test_*.py'
"""


def optimal_gain(p_minus, h, r):
    """K = P^- H / (H P^- H + R). Hint: the denominator carries R, not just the prior."""
    raise NotImplementedError("optimal_gain: K = p_minus * h / (h * p_minus * h + r)")


def joseph_variance(p_minus, h, r, k):
    """P^+ = (1 - K H) P^- (1 - K H) + K R K. Hint: both terms are squares, never a subtraction."""
    raise NotImplementedError("joseph_variance: square the (1 - k * h) factor and add k^2 * r")


def nees_diagonal(error, variances):
    """NEES = sum(e_i^2 / v_i) for a diagonal covariance. Hint: divide, do not subtract."""
    raise NotImplementedError("nees_diagonal: sum(e * e / v for e, v in zip(error, variances))")
