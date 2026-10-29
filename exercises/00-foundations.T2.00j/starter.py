"""Exercise 00-foundations.T2.00j - the learner's file.

The error ellipse a predict step carries: A Sigma A^T + Q, and the guard that keeps it symmetric
over a long run. Fill the two TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T2.00j/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00j -p 'test_*.py'
"""


def covariance_propagate(a, sigma, q):
    """The covariance after one predict step, for 2x2 matrices.

    Refuse (ValueError) any argument that is not exactly 2x2.
    """
    raise NotImplementedError("TODO 1: the covariance after one predict step, refusing any argument that is not two-by-two")


def symmetrize(sigma):
    """The same square matrix made symmetric.

    Refuse (ValueError) a ragged or non-square matrix.
    """
    raise NotImplementedError("TODO 2: the same covariance made symmetric, refusing a ragged or non-square matrix")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
