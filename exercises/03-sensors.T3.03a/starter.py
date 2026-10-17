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

    Trap: v_d_ff is -omega_e * L_q * i_q - the *other* axis's inductance - and v_q_ff carries both
    omega_e * L_d * i_d and the back-EMF omega_e * psi_m.
    """
    raise NotImplementedError("dq_feedforward: -omega_e L_q i_q on d, +omega_e (L_d i_d + psi_m) on q")


def svpwm_offset(va_v, vb_v, vc_v):
    """Return the Min-Max zero-sequence voltage v_0 in V.

    Trap: it is minus half the *sum of the extremes*, not minus the mean and not minus the max.
    """
    raise NotImplementedError("svpwm_offset: v_0 = -(max(v_abc) + min(v_abc)) / 2")


def svpwm_duties(va_v, vb_v, vc_v, vbus_v):
    """Return the three leg duties (d_a, d_b, d_c), each in [0, 1].

    Trap: every leg gets the same v_0 added before dividing by V_bus, and a reference that leaves
    the inscribed circle must raise ValueError rather than be clamped leg by leg.
    """
    raise NotImplementedError("svpwm_duties: d_x = 0.5 + (v_x + v_0) / V_bus, then check the rails")


def hexagon_limit(vbus_v):
    """Return the largest unclipped fundamental phase peak for Min-Max SVPWM, in V.

    Trap: it is V_bus / sqrt(3) = 0.5774 V_bus, not V_bus / 2 and not 2 V_bus / 3.
    """
    raise NotImplementedError("hexagon_limit: V_bus / sqrt(3)")


def hexagon_gain():
    """Return SVPWM's linear-range gain over sine PWM (a bare number, no arguments).

    Trap: the gain is 2/sqrt(3); the percentage boost people quote is 100 * (gain - 1) = 15.47%.
    """
    raise NotImplementedError("hexagon_gain: 2 / sqrt(3)")


def harmonic_coefficients(errors_rad, harmonic):
    """Return (a_h, b_h) for one harmonic, from samples spread evenly over one mechanical turn.

    Trap: the 2/N factor is part of the projection - a 1/N fit halves every coefficient - and the
    sine term is a separate sum from the cosine term.
    """
    raise NotImplementedError("harmonic_coefficients: a_h = 2/N sum e cos(h theta), b_h = 2/N sum e sin(h theta)")


def harmonic_amplitude(a_h, b_h):
    """Return the peak-to-zero amplitude sqrt(a_h^2 + b_h^2) of one harmonic, in rad.

    Trap: amplitudes add in quadrature; a_h + b_h is the wrong shape and can even go negative.
    """
    raise NotImplementedError("harmonic_amplitude: sqrt(a_h^2 + b_h^2)")
