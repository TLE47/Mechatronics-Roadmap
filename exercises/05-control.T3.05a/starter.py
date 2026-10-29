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
    """The Kalman gain for one scalar measurement."""
    raise NotImplementedError("optimal_gain: the gain that trusts the prior and the measurement in proportion to their uncertainties")


def joseph_variance(p_minus, h, r, k):
    """The updated variance from the measurement, in a form that cannot go negative."""
    raise NotImplementedError("joseph_variance: the updated variance, in a form that cannot go negative even with a corrupted gain")


def nees_diagonal(error, variances):
    """The normalised error score for a diagonal covariance."""
    raise NotImplementedError("nees_diagonal: the normalised error score for this diagonal covariance")
