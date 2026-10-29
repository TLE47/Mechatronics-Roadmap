"""Exercise 00-foundations.T1.00d - the learner's file.

The calibration line and its inverse, the unit-circle projection, the Euclidean norm, the
four-quadrant heading and the radian conversion. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00d/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00d -p 'test_*.py'
"""

import math


def sensor_voltage(slope_v_per_a, current_a, offset_v=0.0):
    """The sensor's output voltage at this current."""
    raise NotImplementedError("TODO 1: the voltage the sensor reports at this current")


def sensor_current(slope_v_per_a, voltage_v, offset_v=0.0):
    """The current a voltage reading corresponds to."""
    raise NotImplementedError("TODO 2: the current behind this voltage reading")


def polar_to_cartesian(length_m, theta_rad):
    """The x and y components of a vector at this length and angle."""
    raise NotImplementedError("TODO 3: the two components, with the angle in radians")


def link_length(x_m, y_m):
    """The length of the link from the origin to this point."""
    raise NotImplementedError("TODO 4: the straight-line distance to this point")


def heading_rad(x_m, y_m):
    """The heading of this point, in radians over the full turn."""
    raise NotImplementedError("TODO 5: the heading in radians, correct in every quadrant")


def heading_deg(x_m, y_m):
    """The same heading in degrees."""
    raise NotImplementedError("TODO 6: the same heading in degrees")


def degrees_to_radians(deg):
    """The same angle in radians."""
    raise NotImplementedError("TODO 7: the radian measure of this angle")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
