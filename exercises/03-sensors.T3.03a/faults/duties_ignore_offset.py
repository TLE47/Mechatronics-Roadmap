"""Planted fault: the duties leave the zero-sequence offset out - sine PWM in disguise.

Everything else is `solution.py`; `svpwm_duties` is the one edited function, so this fault must
fail `test_behavior.MinMaxTests.test_the_exercise_duties` (0.875 becomes 1.000 and 0.125 becomes
0.250).
"""

import math


def dq_feedforward(omega_e_rad_s, ld_h, lq_h, id_a, iq_a, psi_m_wb):
    if ld_h < 0.0 or lq_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    if psi_m_wb < 0.0:
        raise ValueError("a permanent-magnet flux linkage is a magnitude, not a signed value")
    vd_ff = -omega_e_rad_s * lq_h * iq_a
    vq_ff = omega_e_rad_s * (ld_h * id_a + psi_m_wb)
    return vd_ff, vq_ff


def svpwm_offset(va_v, vb_v, vc_v):
    for value in (va_v, vb_v, vc_v):
        if not math.isfinite(value):
            raise ValueError("a phase voltage reference must be a finite number")
    return -0.5 * (max(va_v, vb_v, vc_v) + min(va_v, vb_v, vc_v))


def svpwm_duties(va_v, vb_v, vc_v, vbus_v):
    if vbus_v <= 0.0:
        raise ValueError("the DC bus voltage must be positive")
    # <- the planted fault: v_0 is never added, so this is plain sinusoidal PWM
    return tuple(0.5 + v / vbus_v for v in (va_v, vb_v, vc_v))


def hexagon_limit(vbus_v):
    if vbus_v <= 0.0:
        raise ValueError("the DC bus voltage must be positive")
    return vbus_v / math.sqrt(3.0)


def hexagon_gain():
    return 2.0 / math.sqrt(3.0)


def harmonic_coefficients(errors_rad, harmonic):
    samples = list(errors_rad)
    count = len(samples)
    if count < 2:
        raise ValueError("a Fourier fit needs at least two samples over the turn")
    if harmonic < 1:
        raise ValueError("the harmonic order is a positive integer")
    a_h = 0.0
    b_h = 0.0
    for k, error in enumerate(samples):
        angle = 2.0 * math.pi * k / count
        a_h += error * math.cos(harmonic * angle)
        b_h += error * math.sin(harmonic * angle)
    return (2.0 / count) * a_h, (2.0 / count) * b_h


def harmonic_amplitude(a_h, b_h):
    if not math.isfinite(a_h) or not math.isfinite(b_h):
        raise ValueError("harmonic coefficients are finite numbers")
    return math.hypot(a_h, b_h)
