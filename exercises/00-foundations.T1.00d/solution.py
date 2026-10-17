"""Reference solution for 00-foundations.T1.00d.

Seven functions: the linear calibration line and its inverse, the unit-circle projection, the
Euclidean norm, the four-quadrant heading in radians and in degrees, and the degree-to-radian
conversion. Nothing here prints - the self-check prints, the solution computes.
"""

import math


def sensor_voltage(slope_v_per_a, current_a, offset_v=0.0):
    """y = m x + b: the calibration line the datasheet gives you."""
    return slope_v_per_a * current_a + offset_v


def sensor_current(slope_v_per_a, voltage_v, offset_v=0.0):
    """The inverse of the line: x = (y - b) / m."""
    if slope_v_per_a == 0.0:
        raise ValueError("a zero slope has no inverse: the output never moves")
    return (voltage_v - offset_v) / slope_v_per_a


def polar_to_cartesian(length_m, theta_rad):
    """(L cos t, L sin t): the two shadows of the pinned ruler."""
    if length_m < 0.0:
        raise ValueError("a link length cannot be negative")
    return (length_m * math.cos(theta_rad), length_m * math.sin(theta_rad))


def link_length(x_m, y_m):
    """r = sqrt(x^2 + y^2)."""
    return math.hypot(x_m, y_m)


def heading_rad(x_m, y_m):
    """Four-quadrant atan2(y, x) in (-pi, pi]."""
    if x_m == 0.0 and y_m == 0.0:
        raise ValueError("the origin has no heading")
    return math.atan2(y_m, x_m)


def heading_deg(x_m, y_m):
    """The same heading, in degrees."""
    return math.degrees(heading_rad(x_m, y_m))


def degrees_to_radians(deg):
    """theta_rad = theta_deg * pi / 180."""
    return math.radians(deg)
