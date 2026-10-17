"""Planted fault: the length is the Manhattan distance |x| + |y|.

The module's Quadrant III target at (-0.30, -0.40) m is 0.50 m away but this reports 0.70 m.
"""

import math


def sensor_voltage(slope_v_per_a, current_a, offset_v=0.0):
    return slope_v_per_a * current_a + offset_v


def sensor_current(slope_v_per_a, voltage_v, offset_v=0.0):
    if slope_v_per_a == 0.0:
        raise ValueError("a zero slope has no inverse: the output never moves")
    return (voltage_v - offset_v) / slope_v_per_a


def polar_to_cartesian(length_m, theta_rad):
    if length_m < 0.0:
        raise ValueError("a link length cannot be negative")
    return (length_m * math.cos(theta_rad), length_m * math.sin(theta_rad))


def link_length(x_m, y_m):
    return abs(x_m) + abs(y_m)


def heading_rad(x_m, y_m):
    if x_m == 0.0 and y_m == 0.0:
        raise ValueError("the origin has no heading")
    return math.atan2(y_m, x_m)


def heading_deg(x_m, y_m):
    return math.degrees(heading_rad(x_m, y_m))


def degrees_to_radians(deg):
    return math.radians(deg)
