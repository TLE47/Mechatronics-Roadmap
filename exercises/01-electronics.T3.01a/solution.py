"""Exercise 01-electronics.T3.01a - reference solution.

Four production mixed-signal laws, one function each plus the two terms they are built from:

  * the parallel-plate commutation loop inductance and the peak turn-off voltage it produces;
  * mutual inductance between a supply trace and its return, which is what "flux cancelling" buys;
  * the group delay and the Q of a 2nd-order Bessel anti-aliasing filter;
  * the SAR ADC charge bucket: the droop on the first instant and the residual error in LSBs;
  * the Cauer thermal ladder: a junction temperature that is a sum of first-order stages.
"""

import math

MU0 = 4.0 * math.pi * 1e-7  # H/m


def loop_inductance_nh(h_m, w_m, length_m, mu0=MU0):
    """L_loop = mu0 (h / w) length, in nanohenries, for a plane pair h apart."""
    if h_m <= 0.0 or w_m <= 0.0 or length_m <= 0.0:
        raise ValueError("a loop needs a positive dielectric height, width and length")
    return mu0 * (h_m / w_m) * length_m * 1e9


def flux_cancelled_nh(l1_nh, l2_nh, m_nh):
    """L_loop = L1 + L2 - 2 M for anti-parallel supply and return currents, in nH."""
    if l1_nh < 0.0 or l2_nh < 0.0 or m_nh < 0.0:
        raise ValueError("self- and mutual inductances cannot be negative")
    net = l1_nh + l2_nh - 2.0 * m_nh
    if net < 0.0:
        raise ValueError("mutual inductance cannot exceed the geometric mean of the self terms")
    return net


def turn_off_peak_v(v_bus, l_loop_nh, di_dt_a_per_ns):
    """V_DS,peak = V_bus + L_loop di/dt; nH times A/ns is exactly volts."""
    if l_loop_nh < 0.0:
        raise ValueError("an inductance cannot be negative")
    if di_dt_a_per_ns < 0.0:
        raise ValueError("a turn-off slew cannot be negative")
    return v_bus + l_loop_nh * di_dt_a_per_ns


def bessel_group_delay_us(f0_hz):
    """tau_g0 = 1 / (2 pi f0), in microseconds, for a 2nd-order Bessel filter."""
    if f0_hz <= 0.0:
        raise ValueError("a filter needs a positive scaling frequency")
    return 1e6 / (2.0 * math.pi * f0_hz)


def bessel_q():
    """The Q of a 2nd-order Bessel filter: 1 / sqrt(3)."""
    return 1.0 / math.sqrt(3.0)


def charge_droop_fraction(c_sample_f, c_filt_f):
    """The t = 0+ droop: C_sample / (C_filt + C_sample)."""
    if c_sample_f <= 0.0 or c_filt_f <= 0.0:
        raise ValueError("both the sampling and the bucket capacitor must be positive")
    return c_sample_f / (c_filt_f + c_sample_f)


def charge_settling_lsb(bits, c_sample_f, c_filt_f, r_filt_ohm, t_acq_s):
    """Residual settling error at the end of acquisition, in LSBs of a `bits`-bit ADC."""
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
    """T_J = T_amb + P sum_k R_k (1 - exp(-t / tau_k)) over [(R_theta, tau), ...]."""
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


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
