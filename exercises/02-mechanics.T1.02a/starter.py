"""Exercise 02-mechanics.T1.02a - the learner's file.

The lever-arm gravity torque, a balancing force from static equilibrium, the gear ratio and its
speed, torque and power, and the reflected inertia. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/02-mechanics.T1.02a/starter.py \
        python3 -m unittest discover -s exercises/02-mechanics.T1.02a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def gravity_torque(theta_rad, m_link, l_com, m_tip=0.0, l_total=0.0, g=9.81):
    """tau_g = (m_link l_com + m_tip l_total) g cos(theta)."""
    raise NotImplementedError("TODO 1: COSINE, because theta is measured from horizontal")


def balance_force(force_1, x_1, x_2):
    """The upward force at x_2 that balances F_1 at x_1."""
    raise NotImplementedError("TODO 2: a longer lever needs less force, so divide by x_2")


def gear_ratio(z_driven, z_driver):
    """N = driven teeth / driver teeth."""
    raise NotImplementedError("TODO 3: the DRIVEN pulley is on top of the fraction")


def gear_output_speed(omega_motor, ratio):
    """A reducer slows the output."""
    raise NotImplementedError("TODO 4: a reducer divides the speed by N")


def gear_output_torque(tau_motor, ratio, eta=1.0):
    """A reducer multiplies torque."""
    raise NotImplementedError("TODO 5: eta * N * tau_motor - the efficiency is part of it")


def mechanical_power(torque, omega):
    """P = tau * omega."""
    raise NotImplementedError("TODO 6: multiply")


def reflected_inertia(j_motor, ratio):
    """Inertia seen at the output."""
    raise NotImplementedError("TODO 7: the ratio is SQUARED")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
