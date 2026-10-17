"""Exercise 00-foundations.T2.00b - reference solution.

The three operations are the same one seen three ways: a dot product is a projection onto a
direction, a cross product is the area of the parallelogram the two vectors span (with a direction),
and a 2x2 determinant is that same signed area in the plane. A basis is invertible exactly when that
area is not zero - which is why a singular arm pose and a collinear pair of basis vectors fail the
same test.
"""

import math

import mechalab_plant as plant


def dot3(a, b):
    """The 3D dot product."""
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross3(a, b):
    """The 3D cross product a x b."""
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def axial_force(force, lever):
    """Component of `force` along the lever's unit direction, N."""
    length = math.sqrt(dot3(lever, lever))
    if length == 0.0:
        raise ValueError("a zero-length lever has no direction to project onto")
    return dot3(force, [component / length for component in lever])


def moment(lever, force):
    """r x F, N*m."""
    return cross3(lever, force)


def det2(b1, b2):
    """Signed area of the parallelogram spanned by b1 and b2."""
    return b1[0] * b2[1] - b2[0] * b1[1]


def coordinates_in_basis(vector, b1, b2):
    """(c1, c2) with c1*b1 + c2*b2 == vector, or ValueError when the basis is singular."""
    det = det2(b1, b2)
    if abs(det) < 1e-12:
        raise ValueError("basis is singular: det = %.3e, the two directions are collinear" % det)
    c1 = (vector[0] * b2[1] - b2[0] * vector[1]) / det
    c2 = (b1[0] * vector[1] - vector[0] * b1[1]) / det
    return c1, c2


def in_basis(vector, b1, b2):
    """Rebuild the vector from its coordinates."""
    c1, c2 = coordinates_in_basis(vector, b1, b2)
    return [c1 * b1[0] + c2 * b2[0], c1 * b1[1] + c2 * b2[1]]


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
