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
    raise NotImplementedError("TODO 1: how much of a points along b, in the inputs' units")


def cross3(a, b):
    """The 3D cross product a x b, right-handed."""
    raise NotImplementedError("TODO 2: the moment vector whose direction follows the right-hand rule")


def axial_force(force, lever):
    """The component of the force along the lever arm, in newtons."""
    raise NotImplementedError("TODO 3: the part of the force that acts along the lever, whatever the lever's length")


def moment(lever, force):
    """The moment this force produces about the lever's base, in N*m."""
    raise NotImplementedError("TODO 4: the moment this force produces about the lever's base")


def det2(b1, b2):
    """The determinant of the matrix whose columns are b1 and b2."""
    raise NotImplementedError("TODO 5: the signed area the two basis directions span; zero when they are collinear")


def coordinates_in_basis(vector, b1, b2):
    """The two coordinates that rebuild the vector from this basis. Raise ValueError when the
    basis cannot span the plane.
    """
    raise NotImplementedError("TODO 6: the two coordinates of the vector in this basis, refusing a basis that cannot span the plane")


def in_basis(vector, b1, b2):
    """Rebuild the vector from its coordinates in this basis."""
    raise NotImplementedError("TODO 7: the vector those coordinates describe in this basis")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
