"""Exercise 03-sensors.T3.03a - reference solution.

The three things that break a high-speed FOC drive, each as a small pure function:

  * the rotating-frame cross-coupling a current loop has to cancel before it can act
    (`dq_feedforward`);
  * the zero-sequence offset that buys the full hexagon instead of the inscribed circle
    (`svpwm_offset`, `svpwm_duties`, `hexagon_limit`, `hexagon_gain`);
  * the Fourier fit that turns a slow constant-speed sweep into an encoder correction table
    (`harmonic_coefficients`, `harmonic_amplitude`).
"""

import math


def dq_feedforward(omega_e_rad_s, ld_h, lq_h, id_a, iq_a, psi_m_wb):
    """The voltages the PI loops must add to cancel the rotating frame: (v_d_ff, v_q_ff) in V.

        v_d_ff = -omega_e L_q i_q
        v_q_ff = +omega_e (L_d i_d + psi_m)

    `omega_e` is electrical, `p * omega_m`; signing it is the caller's job, and a negative speed
    simply reverses both terms.
    """
    if ld_h < 0.0 or lq_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    if psi_m_wb < 0.0:
        raise ValueError("a permanent-magnet flux linkage is a magnitude, not a signed value")
    vd_ff = -omega_e_rad_s * lq_h * iq_a
    vq_ff = omega_e_rad_s * (ld_h * id_a + psi_m_wb)
    return vd_ff, vq_ff


def svpwm_offset(va_v, vb_v, vc_v):
    """The Min-Max zero-sequence voltage v_0 = -(max(v_abc) + min(v_abc)) / 2, in V.

    Centring the envelope is what lets the common-mode term cancel out of every line-to-line
    voltage while the leg duties stay inside [0, V_bus].
    """
    for value in (va_v, vb_v, vc_v):
        if not math.isfinite(value):
            raise ValueError("a phase voltage reference must be a finite number")
    return -0.5 * (max(va_v, vb_v, vc_v) + min(va_v, vb_v, vc_v))


def svpwm_duties(va_v, vb_v, vc_v, vbus_v):
    """The three leg duty cycles d_x = 0.5 + (v_x + v_0) / V_bus, in [0, 1].

    A command outside the hexagon's inscribed circle is refused rather than clamped: clamping the
    three legs independently is the module's second Common-mistakes row, and the cure is a radial
    scale of (v_alpha, v_beta) before the inverse Park, not a per-leg limit here.
    """
    if vbus_v <= 0.0:
        raise ValueError("the DC bus voltage must be positive")
    v0 = svpwm_offset(va_v, vb_v, vc_v)
    duties = tuple(0.5 + (v + v0) / vbus_v for v in (va_v, vb_v, vc_v))
    for duty in duties:
        if duty < -1e-12 or duty > 1.0 + 1e-12:
            raise ValueError(
                "phase reference %.6g V does not fit the %.6g V bus: the vector is outside the "
                "hexagon's inscribed circle, so scale (v_alpha, v_beta) radially first"
                % (max(abs(va_v), abs(vb_v), abs(vc_v)), vbus_v)
            )
    return duties


def hexagon_limit(vbus_v):
    """The largest unclipped fundamental phase peak Min-Max SVPWM reaches: V_bus / sqrt(3)."""
    if vbus_v <= 0.0:
        raise ValueError("the DC bus voltage must be positive")
    return vbus_v / math.sqrt(3.0)


def hexagon_gain():
    """SVPWM's linear-range gain over sine PWM: 2/sqrt(3) = 1.1547, i.e. +15.47%."""
    return 2.0 / math.sqrt(3.0)


def harmonic_coefficients(errors_rad, harmonic):
    """Fit (a_h, b_h) of one spatial harmonic to `errors_rad` sampled uniformly over one turn.

    Samples are assumed evenly spaced over [0, 2pi), N = len(errors_rad), and

        a_h = (2/N) sum e_k cos(h theta_k),   b_h = (2/N) sum e_k sin(h theta_k)

    so the reconstruction is a_h cos(h theta) + b_h sin(h theta) - the module's section 3, item 3.
    """
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
    """Peak-to-zero amplitude sqrt(a_h^2 + b_h^2) of one harmonic, in rad."""
    if not math.isfinite(a_h) or not math.isfinite(b_h):
        raise ValueError("harmonic coefficients are finite numbers")
    return math.hypot(a_h, b_h)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
