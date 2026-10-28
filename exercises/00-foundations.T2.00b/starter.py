"""Exercise 00-foundations.T2.00b - the learner's file.

Three tools, then the arm: the dot product projects a force onto a link, the cross product turns a
lever arm and a force into a moment, and a 2x2 basis change tells you whether two directions can
still span the plane. Fill the seven TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00b/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00b -p 'test_*.py'

Units are the module's: metres, newtons, N*m, radians. Vectors are 3-lists of floats; 2D basis
vectors are 2-lists, in the order (b1, b2).
"""

import math

import mechalab_plant as plant


def dot3(a, b):
    """The 3D dot product, in whatever units the inputs carry."""
    raise NotImplementedError("TODO 1: each component of one times the matching component of the other, added up")


def cross3(a, b):
    """The 3D cross product a x b, right-handed."""
    raise NotImplementedError("TODO 2: three components, each a 2x2 difference")


def axial_force(force, lever):
    """The component of `force` along the lever arm, in newtons.

    TODO 3: project onto the UNIT direction of the lever — not onto the lever itself. Normalise
    first, so a longer lever cannot multiply the axial force.
    """
    raise NotImplementedError("TODO 3: normalise before projecting")


def moment(lever, force):
    """The moment vector r x F in N*m - the twist the force exerts about the lever's base."""
    raise NotImplementedError("TODO 4: order matters, r x F is not F x r")


def det2(b1, b2):
    """The determinant of the matrix whose columns are b1 and b2.

    TODO 5: the signed area the two basis directions span. Zero means they are collinear, and a
    coordinate cannot be solved.
    """
    raise NotImplementedError("TODO 5: the signed area of the two basis directions")


def coordinates_in_basis(vector, b1, b2):
    """The (c1, c2) with c1*b1 + c2*b2 == vector. Raise ValueError when the basis is singular.

    TODO 6: solve the two-by-two system by Cramer's rule; if the determinant is within 1e-12 of
    zero, the two directions cannot span the plane — say so instead of returning inf or nan.
    """
    raise NotImplementedError("TODO 6: invert the basis, or refuse it")


def in_basis(vector, b1, b2):
    """Rebuild the vector from its coordinates - the inverse of `coordinates_in_basis`."""
    raise NotImplementedError("TODO 7: both basis directions, each scaled by its own coordinate, then added")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
