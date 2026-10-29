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
    raise NotImplementedError("TODO 1: the pose, speed and acceleration at this instant, holding the final pose after the move")


def cubic_coefficients(q0, qf, T):
    """(a0, a1, a2, a3) with zero endpoint velocities."""
    raise NotImplementedError("TODO 2: the cubic's coefficients for this travel and duration")


def peak_velocity(dq, T):
    """Peak speed of a rest-to-rest cubic."""
    raise NotImplementedError("TODO 3: the fastest speed the cubic reaches")


def min_duration_s(dq, qd_max):
    """Shortest move inside a speed limit."""
    raise NotImplementedError("TODO 4: the shortest duration whose peak speed stays inside the limit")


def min_duration_for_acceleration(dq, qdd_max):
    """Shortest move inside an acceleration limit."""
    raise NotImplementedError("TODO 5: the shortest duration whose peak acceleration stays inside the limit")


def spring_damper_torque(q_d, q, dq_d, dq, kp, kd, tau_g=0.0):
    """The torque the springs and dampers apply toward the target pose."""
    raise NotImplementedError("TODO 6: the torque the stiffness and damping apply toward the target pose and speed")


def compliance_deflection(tau_ext, kp):
    """Steady yield under a hand push."""
    raise NotImplementedError("TODO 7: the steady yield under a hand push at this stiffness")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
