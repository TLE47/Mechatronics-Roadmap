"""Planted fault: L_loop = L1 + L2 + 2M.

Caught by `test_behavior.FluxTests.test_the_skip_test_is_1_6_nanohenries`, which reads 22.4 nH for
a pair whose anti-parallel currents cancel most of the field.
"""

import math

MU0 = 4.0 * math.pi * 1e-7


def loop_inductance_nh(h_m, w_m, length_m, mu0=MU0):
    if h_m <= 0.0 or w_m <= 0.0 or length_m <= 0.0:
        raise ValueError("a loop needs a positive dielectric height, width and length")
    return mu0 * (h_m / w_m) * length_m * 1e9


def flux_cancelled_nh(l1_nh, l2_nh, m_nh):
    if l1_nh < 0.0 or l2_nh < 0.0 or m_nh < 0.0:
        raise ValueError("self- and mutual inductances cannot be negative")
    net = l1_nh + l2_nh + 2.0 * m_nh  # FAULT: anti-parallel currents subtract the mutual term
    if net < 0.0:
        raise ValueError("mutual inductance cannot exceed the geometric mean of the self terms")
    return net


def turn_off_peak_v(v_bus, l_loop_nh, di_dt_a_per_ns):
    if l_loop_nh < 0.0:
        raise ValueError("an inductance cannot be negative")
    if di_dt_a_per_ns < 0.0:
        raise ValueError("a turn-off slew cannot be negative")
    return v_bus + l_loop_nh * di_dt_a_per_ns


def bessel_group_delay_us(f0_hz):
    if f0_hz <= 0.0:
        raise ValueError("a filter needs a positive scaling frequency")
    return 1e6 / (2.0 * math.pi * f0_hz)


def bessel_q():
    return 1.0 / math.sqrt(3.0)


def charge_droop_fraction(c_sample_f, c_filt_f):
    if c_sample_f <= 0.0 or c_filt_f <= 0.0:
        raise ValueError("both the sampling and the bucket capacitor must be positive")
    return c_sample_f / (c_filt_f + c_sample_f)


def charge_settling_lsb(bits, c_sample_f, c_filt_f, r_filt_ohm, t_acq_s):
    if bits < 1:
        raise ValueError("an ADC needs at least one bit")
    if r_filt_ohm <= 0.0:
        raise ValueError("the bucket's series resistance must be positive")
    if t_acq_s < 0.0:
        raise ValueError("an acquisition window cannot be negative")
    tau_s = r_filt_ohm * c_filt_f
    return (
        (2.0 ** bits)
        * charge_droop_fraction(c_sample_f, c_filt_f)
        * math.exp(-t_acq_s / tau_s)
    )


def cauer_junction_c(t_amb_c, p_loss_w, stages, t_s):
    if p_loss_w < 0.0:
        raise ValueError("a dissipation cannot be negative")
    if t_s < 0.0:
        raise ValueError("time does not run backwards")
    if not stages:
        raise ValueError("a thermal ladder needs at least one R_theta/tau stage")
    rise_c = 0.0
    for r_theta, tau_s in stages:
        if r_theta < 0.0:
            raise ValueError("a thermal resistance cannot be negative")
        if tau_s <= 0.0:
            raise ValueError("a thermal time constant must be positive")
        rise_c += r_theta * (1.0 - math.exp(-t_s / tau_s))
    return t_amb_c + p_loss_w * rise_c
