"""Planted fault: the determinant with a plus sign.

`ad + bc` agrees with `ad - bc` whenever one of the cross terms is zero - which is every
axis-aligned basis - and the collinear test then passes a pair that cannot span the plane.
"""

from solution import *  # noqa: F401,F403
import solution


def det2(b1, b2):
    return b1[0] * b2[1] + b2[0] * b1[1]


def coordinates_in_basis(vector, b1, b2):
    det = det2(b1, b2)
    if abs(det) < 1e-12:
        raise ValueError("singular")
    return ((vector[0] * b2[1] - b2[0] * vector[1]) / det,
            (b1[0] * vector[1] - vector[0] * b1[1]) / det)
