"""Exercise 06-robotics.T1.06a - the learner's file.

The rest-to-rest cubic, its coefficients, its peak speed, the duration an actuator allows, the
spring-damper torque and the compliance yield. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/06-robotics.T1.06a/starter.py \
        python3 -m unittest discover -s exercises/06-robotics.T1.06a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def cubic_rest_to_rest(t, q0, qf, T):
    """(q, qd, qdd) at time t for a rest-to-rest cubic."""
    raise NotImplementedError("TODO 1: 3s^2 - 2s^3; hold the final pose, still, once t >= T")


def cubic_coefficients(q0, qf, T):
    """(a0, a1, a2, a3) with zero endpoint velocities."""
    raise NotImplementedError("TODO 2: a2 = 3dq/T^2, a3 = -2dq/T^3, and a1 = 0")


def peak_velocity(dq, T):
    """Peak speed of a rest-to-rest cubic."""
    raise NotImplementedError("TODO 3: 1.5x the average, not 1x")


def min_duration_s(dq, qd_max):
    """Shortest move inside a speed limit."""
    raise NotImplementedError("TODO 4: solve 1.5|dq|/T = qd_max for T")


def min_duration_for_acceleration(dq, qdd_max):
    """Shortest move inside an acceleration limit."""
    raise NotImplementedError("TODO 5: peak acceleration is 6|dq|/T^2")


def spring_damper_torque(q_d, q, dq_d, dq, kp, kd, tau_g=0.0):
    """tau = kp (q_d - q) + kd (dq_d - dq) + tau_g."""
    raise NotImplementedError("TODO 6: stiffness multiplies position error, damping velocity error")


def compliance_deflection(tau_ext, kp):
    """Steady yield under a hand push."""
    raise NotImplementedError("TODO 7: a stiffer spring yields less, so divide")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
