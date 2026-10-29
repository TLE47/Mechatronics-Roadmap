"""Exercise 05-control.T1.05a - the learner's file.

The closed-loop error, the PID demand, the integral tick and its anti-windup freeze, the
saturation, the gravity sag a pure P loop leaves, and the arm's acceleration. Fill the seven
TODOs:

    EXERCISE_TARGET=exercises/05-control.T1.05a/starter.py \
        python3 -m unittest discover -s exercises/05-control.T1.05a -p 'test_*.py'
"""


def tracking_error(r, y):
    """The error the loop acts on, with the sign that pulls toward the target."""
    raise NotImplementedError("TODO 1: the error the loop acts on, with the sign that pulls toward the target")


def control_effort(r, y, dy, i_term, kp, kd):
    """The raw effort from the spring, damper and integral."""
    raise NotImplementedError("TODO 2: the raw effort from the spring, the damper and the integral")


def integral_step(i_prev, ki, e, dt):
    """The integral after one tick, in effort units."""
    raise NotImplementedError("TODO 3: the integral after this tick, in effort units")


def anti_windup_integral(i_prev, ki, e, dt, u_raw, u_max, i_max=None):
    """The integral this tick may keep, frozen while the demand is past a rail."""
    raise NotImplementedError("TODO 4: the integral this tick may keep while the actuator is saturated")


def saturate(u_raw, u_max):
    """The command, held inside both rails."""
    raise NotImplementedError("TODO 5: the command, held inside both rails")


def steady_state_sag(tau_g, kp):
    """The angle the joint settles below its target under gravity."""
    raise NotImplementedError("TODO 6: the angle the joint settles below its target under gravity")


def arm_acceleration(torque, dq, tau_g, j, b):
    """The joint's acceleration from the applied torque."""
    raise NotImplementedError("TODO 7: the joint's acceleration from the applied torque")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
