"""Planted fault: the projection onto the raw lever, not its unit direction.

Passes the worked example at exactly one lever length (0.5 m makes it 2x wrong, and it is 1x wrong
only when the lever is a unit vector), and makes a longer wrench multiply the force.
"""

from solution import *  # noqa: F401,F403
import solution


def axial_force(force, lever):
    return solution.dot3(force, lever)
