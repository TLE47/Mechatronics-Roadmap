"""Exercise 05-control.T1.05a - the learner's file.

The closed-loop error, the PID demand, the integral tick and its anti-windup freeze, the
saturation, the gravity sag a pure P loop leaves, and the arm's acceleration. Fill the seven
TODOs:

    EXERCISE_TARGET=exercises/05-control.T1.05a/starter.py \
        python3 -m unittest discover -s exercises/05-control.T1.05a -p 'test_*.py'
"""


def tracking_error(r, y):
    """e = r - y."""
    raise NotImplementedError("TODO 1: the reference minus the measurement — getting the SIGN right is the whole point")


def control_effort(r, y, dy, i_term, kp, kd):
    """u_raw = Kp (r - y) - Kd dy + I."""
    raise NotImplementedError("TODO 2: the damper SUBTRACTS Kd dy; it opposes velocity, not error")


def integral_step(i_prev, ki, e, dt):
    """I_k = I_{k-1} + Ki e dt."""
    raise NotImplementedError("TODO 3: the tick includes dt — forgetting it grows the bias a thousandfold")


def anti_windup_integral(i_prev, ki, e, dt, u_raw, u_max, i_max=None):
    """The integral this tick may keep, frozen while the demand is past a rail."""
    raise NotImplementedError("TODO 4: freeze only when the demand is past a rail AND the error pushes the same way")


def saturate(u_raw, u_max):
    """clip(u_raw, -u_max, +u_max)."""
    raise NotImplementedError("TODO 5: both rails — a one-sided clip lets a negative demand through")


def steady_state_sag(tau_g, kp):
    """e_ss = tau_g / Kp."""
    raise NotImplementedError("TODO 6: the spring must carry the gravity torque, so the sag is that torque shared out by Kp")


def arm_acceleration(torque, dq, tau_g, j, b):
    """ddq = (u - b dq - tau_g) / J."""
    raise NotImplementedError("TODO 7: damping and gravity come OFF the torque before dividing by J")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
