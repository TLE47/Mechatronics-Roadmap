"""Exercise 00-foundations.T1.00d - the learner's file.

The calibration line and its inverse, the unit-circle projection, the Euclidean norm, the
four-quadrant heading and the radian conversion. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00d/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00d -p 'test_*.py'
"""

import math


def sensor_voltage(slope_v_per_a, current_a, offset_v=0.0):
    """y = m x + b."""
    raise NotImplementedError("TODO 1: multiply, then add the zero-current offset")


def sensor_current(slope_v_per_a, voltage_v, offset_v=0.0):
    """x = (y - b) / m."""
    raise NotImplementedError("TODO 2: subtract the offset BEFORE dividing by the slope")


def polar_to_cartesian(length_m, theta_rad):
    """(L cos t, L sin t)."""
    raise NotImplementedError("TODO 3: cosine for x, sine for y, and theta is in RADIANS")


def link_length(x_m, y_m):
    """r = sqrt(x^2 + y^2)."""
    raise NotImplementedError("TODO 4: the diagonal, not the taxi ride x + y")


def heading_rad(x_m, y_m):
    """Four-quadrant atan2(y, x) in (-pi, pi]."""
    raise NotImplementedError("TODO 5: atan2 takes y FIRST; plain atan cannot see the quadrant")


def heading_deg(x_m, y_m):
    """The same heading in degrees."""
    raise NotImplementedError("TODO 6: reuse heading_rad, then convert")


def degrees_to_radians(deg):
    """theta_rad = theta_deg * pi / 180."""
    raise NotImplementedError("TODO 7: 180 degrees is pi, not 180")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
