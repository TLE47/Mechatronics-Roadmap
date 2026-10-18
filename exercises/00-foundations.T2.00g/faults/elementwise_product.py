"""Planted fault: `A @ x` written as an elementwise product.

A beginner's first attempt with a matrix and a column: multiply matching entries and stop. It gets
the diagonal right and nothing else, and the shape comes back as a row instead of a column.
"""

from solution import *  # noqa: F401,F403


def mat_vec(A, x):
    return [a * xi for a, xi in zip(A[0], x)]
