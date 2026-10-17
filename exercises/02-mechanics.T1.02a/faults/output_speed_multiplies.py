"""Planted fault: the reducer multiplies the output speed by N.

A 4.5:1 belt then reports 405 rad/s at the joint from a 90 rad/s motor, and every downstream
velocity limit is set from a number that cannot happen.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def gravity_torque(theta_rad, m_link, l_com, m_tip=0.0, l_total=0.0, g=9.81):
    """tau_g = (m_link l_com + m_tip l_total) g cos(theta), theta measured from horizontal."""
    if m_link < 0.0 or m_tip < 0.0:
        raise ValueError("a mass cannot be negative")
    if l_com < 0.0 or l_total < 0.0:
        raise ValueError("a lever arm cannot be negative")
    if g <= 0.0:
        raise ValueError("gravity must point somewhere")
    return (m_link * l_com + m_tip * l_total) * g * math.cos(theta_rad)


def balance_force(force_1, x_1, x_2):
    """The upward force at x_2 that balances F_1 at x_1: F_2 = F_1 x_1 / x_2."""
    if x_2 <= 0.0:
        raise ValueError("a balance point must be a positive distance from the pivot")
    return force_1 * x_1 / x_2


def gear_ratio(z_driven, z_driver):
    """N = driven teeth / driver teeth; a reducer has N > 1."""
    if z_driver <= 0.0 or z_driven <= 0.0:
        raise ValueError("tooth counts are positive integers")
    return z_driven / z_driver


def gear_output_speed(omega_motor, ratio):
    """omega_load = omega_motor * N."""
    if ratio <= 0.0:
        raise ValueError("the ratio must be positive")
    return omega_motor * ratio


def gear_output_torque(tau_motor, ratio, eta=1.0):
    """A reducer multiplies torque by eta * N, where eta is the efficiency in (0, 1]."""
    if ratio <= 0.0:
        raise ValueError("the ratio must be positive")
    if not 0.0 < eta <= 1.0:
        raise ValueError("efficiency is a fraction in (0, 1]")
    return eta * ratio * tau_motor


def mechanical_power(torque, omega):
    """P = tau * omega."""
    return torque * omega


def reflected_inertia(j_motor, ratio):
    """Inertia seen at the output: J_refl = N^2 J_motor."""
    if j_motor < 0.0:
        raise ValueError("an inertia cannot be negative")
    if ratio <= 0.0:
        raise ValueError("the ratio must be positive")
    return ratio * ratio * j_motor
