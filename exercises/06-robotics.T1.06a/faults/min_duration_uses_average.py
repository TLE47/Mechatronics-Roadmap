"""Planted fault: the minimum duration is solved with the average speed.

A 2 rad move limited to 3 rad/s is then commanded in 0.67 s, whose real peak is 4.5 rad/s.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def cubic_rest_to_rest(t, q0, qf, T):
    """(q, qd, qdd) at time t for a rest-to-rest cubic; clamped to the endpoints outside [0, T]."""
    if T <= 0.0:
        raise ValueError("a move needs a positive duration")
    if t > T:
        return qf, 0.0, 0.0
    s = min(1.0, max(0.0, t / T))
    dq = qf - q0
    q = q0 + dq * (3.0 * s * s - 2.0 * s * s * s)
    qd = (6.0 * dq / T) * (s - s * s)
    qdd = (6.0 * dq / (T * T)) * (1.0 - 2.0 * s)
    return q, qd, qdd


def cubic_coefficients(q0, qf, T):
    """(a0, a1, a2, a3) of q(t) = a0 + a1 t + a2 t^2 + a3 t^3 with zero endpoint velocities."""
    if T <= 0.0:
        raise ValueError("a move needs a positive duration")
    dq = qf - q0
    return q0, 0.0, 3.0 * dq / (T * T), -2.0 * dq / (T * T * T)


def peak_velocity(dq, T):
    """Peak speed of a rest-to-rest cubic: 1.5 * dq / T."""
    if T <= 0.0:
        raise ValueError("a move needs a positive duration")
    return 1.5 * dq / T


def min_duration_s(dq, qd_max):
    """Shortest move whose peak speed stays inside the actuator's limit."""
    if qd_max <= 0.0:
        raise ValueError("a speed limit must be positive")
    return abs(dq) / qd_max


def min_duration_for_acceleration(dq, qdd_max):
    """Shortest move whose peak acceleration 6|dq|/T^2 stays inside the actuator's limit."""
    if qdd_max <= 0.0:
        raise ValueError("an acceleration limit must be positive")
    return math.sqrt(6.0 * abs(dq) / qdd_max)


def spring_damper_torque(q_d, q, dq_d, dq, kp, kd, tau_g=0.0):
    """tau = kp (q_d - q) + kd (dq_d - dq) + tau_g."""
    if kp < 0.0 or kd < 0.0:
        raise ValueError("stiffness and damping cannot be negative")
    return kp * (q_d - q) + kd * (dq_d - dq) + tau_g


def compliance_deflection(tau_ext, kp):
    """Steady yield under a hand push at rest: tau_ext / kp."""
    if kp <= 0.0:
        raise ValueError("a spring needs positive stiffness")
    return tau_ext / kp


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
