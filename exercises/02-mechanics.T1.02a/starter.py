"""Exercise 02-mechanics.T1.02a - the learner's file.

The lever-arm gravity torque, a balancing force from static equilibrium, the gear ratio and its
speed, torque and power, and the reflected inertia. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/02-mechanics.T1.02a/starter.py \
        python3 -m unittest discover -s exercises/02-mechanics.T1.02a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def gravity_torque(theta_rad, m_link, l_com, m_tip=0.0, l_total=0.0, g=9.81):
    """The shoulder torque that holds the link and its tip payload at this angle from horizontal."""
    raise NotImplementedError("TODO 1: the shoulder torque gravity demands at this angle")


def balance_force(force_1, x_1, x_2):
    """The upward force at x_2 that balances F_1 at x_1."""
    raise NotImplementedError("TODO 2: the force at the second point that holds the lever level")


def gear_ratio(z_driven, z_driver):
    """The reduction ratio the two pulleys give."""
    raise NotImplementedError("TODO 3: the ratio these two tooth counts give")


def gear_output_speed(omega_motor, ratio):
    """The joint speed behind a reducer."""
    raise NotImplementedError("TODO 4: the joint speed this reducer gives from the motor speed")


def gear_output_torque(tau_motor, ratio, eta=1.0):
    """The joint torque behind a reducer."""
    raise NotImplementedError("TODO 5: the joint torque this reducer delivers, allowing for its efficiency")


def mechanical_power(torque, omega):
    """The mechanical power at this torque and speed."""
    raise NotImplementedError("TODO 6: the power this torque delivers at this speed")


def reflected_inertia(j_motor, ratio):
    """Inertia seen at the output."""
    raise NotImplementedError("TODO 7: the inertia the joint feels because of this motor inertia")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
