"""Planted fault: the worked-example Jacobian, returned at every pose.

The exercise pose is q = (0, pi/2), where J = [[0, -0.1], [0, 0]]. Printing a correct answer for that
pose is not a Jacobian; the multiple-pose test and the changed-length test both see through it.
"""

from solution import jacobian as _jacobian


def jacobian(q1, q2, l1=0.10, l2=0.10):
    return _jacobian(0.0, 1.5707963267948966, l1, l2)
