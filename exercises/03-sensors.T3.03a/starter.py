"""Exercise 03-sensors.T3.03a - starter.

Seven holes, one per idea: the two decoupling feedforward voltages, the Min-Max offset, the duty
cycles, the hexagonal limit and its gain, and the Fourier fit with its amplitude. Each docstring
names the mistake it is guarding against, so a wrong answer has somewhere to look.

Edit this file, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/03-sensors.T3.03a/starter.py \
      python3 -m unittest discover -s exercises/03-sensors.T3.03a -p 'test_*.py'
"""

import math


def dq_feedforward(omega_e_rad_s, ld_h, lq_h, id_a, iq_a, psi_m_wb):
    """Return (v_d_ff, v_q_ff) in V.

    Trap: each axis is fed the *other* axis's inductance, and the q axis also carries the
    back-EMF.
    """
    raise NotImplementedError("dq_feedforward: the two decoupling feedforward voltages, each from the other axis")


def svpwm_offset(va_v, vb_v, vc_v):
    """Return the Min-Max zero-sequence voltage v_0 in V.

    Trap: it comes from the two extremes together, not from the mean and not from the max alone.
    """
    raise NotImplementedError("svpwm_offset: the zero-sequence offset that centres the three references")


def svpwm_duties(va_v, vb_v, vc_v, vbus_v):
    """Return the three leg duties (d_a, d_b, d_c), each in [0, 1].

    Trap: every leg shares the same v_0 before the bus scaling, and a reference that leaves the
    inscribed circle must raise ValueError rather than be clamped leg by leg.
    """
    raise NotImplementedError("svpwm_duties: the three leg duties, refusing a reference that leaves the inscribed circle")


def hexagon_limit(vbus_v):
    """Return the largest unclipped fundamental phase peak for Min-Max SVPWM, in V.

    Trap: it sits between half the bus and two thirds of it.
    """
    raise NotImplementedError("hexagon_limit: the largest unclipped fundamental phase peak this bus allows")


def hexagon_gain():
    """Return SVPWM's linear-range gain over sine PWM (a bare number, no arguments).

    Trap: the gain is the familiar SVPWM advantage over sine PWM; the percentage boost people
    quote follows from it.
    """
    raise NotImplementedError("hexagon_gain: the linear-range gain over sine PWM, as a bare number")


def harmonic_coefficients(errors_rad, harmonic):
    """Return (a_h, b_h) for one harmonic, from samples spread evenly over one mechanical turn.

    Trap: the projection carries the usual normalisation for a full turn, and the sine and
    cosine terms are fitted separately.
    """
    raise NotImplementedError("harmonic_coefficients: the cosine and sine coefficients of this harmonic")


def harmonic_amplitude(a_h, b_h):
    """Return the peak-to-zero amplitude of one harmonic, in rad.

    Trap: the amplitude is the quadrature combination; adding the coefficients is the wrong shape
    and can even go negative.
    """
    raise NotImplementedError("harmonic_amplitude: the peak amplitude of this harmonic, in rad")
