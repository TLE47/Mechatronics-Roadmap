"""Exercise 05-control.T1.05a - reference solution.

The error a closed loop sees, the virtual spring-damper demand with its integral bias, the
integral tick, the freeze that keeps the accumulator from winding up past a rail, both
saturation rails, the gravity sag a pure proportional spring leaves behind, and the
acceleration the delivered torque actually produces on the module's 1-DOF arm.
"""


def tracking_error(r, y):
    """e = r - y: the sign that makes a positive error pull towards the target, not away."""
    return r - y


def control_effort(r, y, dy, i_term, kp, kd):
    """u_raw = Kp (r - y) - Kd dy + I - a spring, a damper on measured velocity, and the bias.

    The derivative acts on the measurement (`-Kd dy`), not on the error, so a step in `r` cannot
    produce a derivative kick.
    """
    if kp < 0.0 or kd < 0.0:
        raise ValueError("gains cannot be negative - a negative gain is positive feedback")
    return kp * (r - y) - kd * dy + i_term


def integral_step(i_prev, ki, e, dt):
    """I_k = I_{k-1} + Ki e dt, in the same units as the effort."""
    if ki < 0.0:
        raise ValueError("the integral gain cannot be negative")
    if dt <= 0.0:
        raise ValueError("the control period must be positive")
    return i_prev + ki * e * dt


def anti_windup_integral(i_prev, ki, e, dt, u_raw, u_max, i_max=None):
    """The integral this tick is allowed to keep.

    Clamping anti-windup freezes the accumulator while the demand is past a rail *and* the error
    still pushes that way; `i_max` additionally caps its magnitude when it is given.
    """
    if u_max is None or u_max <= 0.0:
        raise ValueError("the actuator limit must be positive")
    candidate = integral_step(i_prev, ki, e, dt)
    if i_max is not None:
        if i_max < 0.0:
            raise ValueError("an integral cap cannot be negative")
        candidate = max(-i_max, min(i_max, candidate))
    if abs(u_raw) > u_max and e * u_raw > 0.0:
        return i_prev
    return candidate


def saturate(u_raw, u_max):
    """clip(u_raw, -u_max, +u_max) - both rails, not just the positive one."""
    if u_max <= 0.0:
        raise ValueError("the actuator limit must be positive")
    return max(-u_max, min(u_max, u_raw))


def steady_state_sag(tau_g, kp):
    """e_ss = tau_g / Kp: the gravity sag a pure proportional spring leaves at rest."""
    if kp <= 0.0:
        raise ValueError("the proportional gain must be positive")
    return tau_g / kp


def arm_acceleration(torque, dq, tau_g, j, b):
    """ddq = (u - b dq - tau_g) / J for the module's 1-DOF rotational arm."""
    if j <= 0.0:
        raise ValueError("the inertia must be positive")
    if b < 0.0:
        raise ValueError("damping cannot be negative")
    return (torque - b * dq - tau_g) / j


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
