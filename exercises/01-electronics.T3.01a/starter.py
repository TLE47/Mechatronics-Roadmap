"""Exercise 01-electronics.T3.01a - the learner's file.

The commutation-loop inductance and its turn-off spike, mutual-inductance flux cancellation, the
Bessel group delay and Q, and the SAR charge bucket and Cauer thermal ladder. Fill the eight TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T3.01a/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T3.01a -p 'test_*.py'
"""

import math

MU0 = 4.0 * math.pi * 1e-7  # H/m


def loop_inductance_nh(h_m, w_m, length_m, mu0=MU0):
    """L_loop = mu0 (h / w) length, in nanohenries."""
    raise NotImplementedError("TODO 1: height OVER width, then the length, then 1e9 for nH")


def flux_cancelled_nh(l1_nh, l2_nh, m_nh):
    """L_loop = L1 + L2 - 2 M, in nH."""
    raise NotImplementedError("TODO 2: the mutual term is counted TWICE and SUBTRACTED")


def turn_off_peak_v(v_bus, l_loop_nh, di_dt_a_per_ns):
    """V_DS,peak = V_bus + L_loop di/dt."""
    raise NotImplementedError("TODO 3: nH times A/ns is already volts - no 1e-9 or 1e9 here")


def bessel_group_delay_us(f0_hz):
    """tau_g0 = 1 / (2 pi f0), in microseconds."""
    raise NotImplementedError("TODO 4: the 2 pi and the micro prefix are both easy to drop")


def bessel_q():
    """The Q of a 2nd-order Bessel filter."""
    raise NotImplementedError("TODO 5: 1 / sqrt(3), about 0.577 - not 1/sqrt(2)")


def charge_droop_fraction(c_sample_f, c_filt_f):
    """The t = 0+ droop fraction of a SAR charge bucket."""
    raise NotImplementedError("TODO 6: the bucket and the sampling capacitor SHARE the step")


def charge_settling_lsb(bits, c_sample_f, c_filt_f, r_filt_ohm, t_acq_s):
    """Residual settling error in LSBs after t_acq."""
    raise NotImplementedError(
        "TODO 7: 2**bits times the droop, decayed by exp(-t / (R_filt C_filt)) - C_filt, not the sum"
    )


def cauer_junction_c(t_amb_c, p_loss_w, stages, t_s):
    """Junction temperature of a Cauer ladder under a rectangular pulse."""
    raise NotImplementedError("TODO 8: each stage is R (1 - exp(-t / tau)); add the rises")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
