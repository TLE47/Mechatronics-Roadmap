"""Planted fault for 05-control.T1.05a: the integral tick forgets the control period.

One edit from `solution.py`: `i_prev + ki * e`, so at the module's 1 kHz loop the bias grows a
thousandfold per tick. The Gate test's 0.005 N*m update comes out 5.0 N*m.
"""


def tracking_error(r, y):
    """e = r - y."""
    return r - y


def control_effort(r, y, dy, i_term, kp, kd):
    """u_raw = Kp (r - y) - Kd dy + I."""
    if kp < 0.0 or kd < 0.0:
        raise ValueError("gains cannot be negative - a negative gain is positive feedback")
    return kp * (r - y) - kd * dy + i_term


def integral_step(i_prev, ki, e, dt):
    """I_k = I_{k-1} + Ki e dt."""
    if ki < 0.0:
        raise ValueError("the integral gain cannot be negative")
    if dt <= 0.0:
        raise ValueError("the control period must be positive")
    return i_prev + ki * e


def anti_windup_integral(i_prev, ki, e, dt, u_raw, u_max, i_max=None):
    """The integral this tick is allowed to keep."""
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
    """clip(u_raw, -u_max, +u_max)."""
    if u_max <= 0.0:
        raise ValueError("the actuator limit must be positive")
    return max(-u_max, min(u_max, u_raw))


def steady_state_sag(tau_g, kp):
    """e_ss = tau_g / Kp."""
    if kp <= 0.0:
        raise ValueError("the proportional gain must be positive")
    return tau_g / kp


def arm_acceleration(torque, dq, tau_g, j, b):
    """ddq = (u - b dq - tau_g) / J."""
    if j <= 0.0:
        raise ValueError("the inertia must be positive")
    if b < 0.0:
        raise ValueError("damping cannot be negative")
    return (torque - b * dq - tau_g) / j
