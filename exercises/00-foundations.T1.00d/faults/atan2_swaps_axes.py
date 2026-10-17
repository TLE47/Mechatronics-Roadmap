"""Planted fault: `atan2(x, y)` with the arguments swapped.

Everything is mirrored across the y = x diagonal: the exercise's Quadrant III target at
(-0.30, -0.40) m is reported as -143.13 deg instead of -126.87 deg.
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
    return math.hypot(x_m, y_m)


def heading_rad(x_m, y_m):
    if x_m == 0.0 and y_m == 0.0:
        raise ValueError("the origin has no heading")
    return math.atan2(x_m, y_m)


def heading_deg(x_m, y_m):
    return math.degrees(heading_rad(x_m, y_m))


def degrees_to_radians(deg):
    return math.radians(deg)
