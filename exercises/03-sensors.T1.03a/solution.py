"""Exercise 03-sensors.T1.03a - reference solution.

Every electric motor is an actuator and a generator at once: torque is ``tau = Kt i``, the spinning
rotor makes ``v_bemf = Ke omega_m``, and the terminal voltage pays for both. A BLDC rotor with ``p``
pole pairs makes its electrical angle spin ``p`` times faster than the shaft, and a quadrature
encoder turns two 90-degree-shifted channels into ``4 N_lines`` counts per revolution.

Angles here are radians, ``electrical_angle`` returns a wrapped value in ``[0, 2*pi)`` (the gate
test's answer key uses ``math.fmod``, which keeps the sign - both name the same physical angle).
"""

import math

TAU = 2.0 * math.pi


def back_emf(ke_v_s_rad, omega_m_rad_s):
    """v_bemf = Ke * omega_m in volts; a reversing shaft gives a negative EMF."""
    if ke_v_s_rad <= 0.0:
        raise ValueError("the back-EMF constant must be positive")
    return ke_v_s_rad * omega_m_rad_s


def winding_current(v_term_v, omega_m_rad_s, ke_v_s_rad, r_ohm):
    """i = (V_term - Ke omega_m) / R in amperes; negative when the motor is generating."""
    if r_ohm <= 0.0:
        raise ValueError("winding resistance must be positive")
    if ke_v_s_rad <= 0.0:
        raise ValueError("the back-EMF constant must be positive")
    return (v_term_v - ke_v_s_rad * omega_m_rad_s) / r_ohm


def motor_torque(kt_nm_a, current_a):
    """tau = Kt * i in N*m; a negative current is braking torque."""
    if kt_nm_a <= 0.0:
        raise ValueError("the torque constant must be positive")
    return kt_nm_a * current_a


def pole_pairs(n_poles):
    """p = N_poles / 2. A '12N14P' motor has 14 magnets, so p = 7 - not 14."""
    if not isinstance(n_poles, int) or isinstance(n_poles, bool):
        raise ValueError("a magnet count is a whole number")
    if n_poles <= 0:
        raise ValueError("a rotor has at least one magnet")
    if n_poles % 2:
        raise ValueError("magnets come in North-South pairs, so the count is even")
    return n_poles // 2


def electrical_angle(theta_m_rad, p):
    """theta_e = (p * theta_m) mod 2*pi, wrapped into [0, 2*pi)."""
    if not isinstance(p, int) or isinstance(p, bool):
        raise ValueError("the pole-pair count is a whole number")
    if p < 1:
        raise ValueError("a motor has at least one pole pair")
    wrapped = math.fmod(p * theta_m_rad, TAU)
    if wrapped < 0.0:
        wrapped += TAU
    return wrapped


def quadrature_cpr(n_lines):
    """CPR = 4 * N_lines: both edges of both channels count, so 1024 lines is 4096 counts."""
    if not isinstance(n_lines, int) or isinstance(n_lines, bool):
        raise ValueError("a line count is a whole number")
    if n_lines <= 0:
        raise ValueError("an encoder disc has at least one line")
    return 4 * n_lines


def angle_resolution(counts_per_rev):
    """(radians, degrees) per count: 2*pi / CPR and 360 / CPR."""
    if not isinstance(counts_per_rev, int) or isinstance(counts_per_rev, bool):
        raise ValueError("a count is a whole number")
    if counts_per_rev <= 0:
        raise ValueError("an encoder reports at least one count per revolution")
    return (TAU / counts_per_rev, 360.0 / counts_per_rev)


def quad_step(prev_ab, curr_ab):
    """One 4x quadrature step: +1 forward, -1 reverse, 0 for no change or an invalid jump.

    Valid forward cycle: 00 -> 10 -> 11 -> 01 -> 00 (the Gray code, one bit per edge). A jump of
    two bits at once (00 -> 11) is a glitch or a sample rate below the shaft's edge rate, so it is
    not a step in either direction.
    """
    for code in (prev_ab, curr_ab):
        if not isinstance(code, int) or isinstance(code, bool) or not 0 <= code <= 0b11:
            raise ValueError("a quadrature state is two bits: 0b00, 0b01, 0b10 or 0b11")
    forward = {(0b00, 0b10): 1, (0b10, 0b11): 1, (0b11, 0b01): 1, (0b01, 0b00): 1}
    reverse = {(0b00, 0b01): -1, (0b01, 0b11): -1, (0b11, 0b10): -1, (0b10, 0b00): -1}
    return forward.get((prev_ab, curr_ab), reverse.get((prev_ab, curr_ab), 0))


# No `__main__` block on purpose: the browser compares this file's stdout with the appended
# self-check's single PASS line, so a second print here would fail a correct answer.
