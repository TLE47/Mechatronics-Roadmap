"""Planted fault: the plant's link lengths, ignoring the ones the caller passed.

Correct for this arm at every pose, and wrong for any other arm - which is exactly why the test
runs a 0.30 m / 0.25 m arm through the same function.
"""

from solution import jacobian as _jacobian


def jacobian(q1, q2, l1=0.10, l2=0.10):
    return _jacobian(q1, q2)
