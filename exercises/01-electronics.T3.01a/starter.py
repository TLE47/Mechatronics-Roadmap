"""Exercise 01-electronics.T3.01a - the learner's file.

The commutation-loop inductance and its turn-off spike, mutual-inductance flux cancellation, the
Bessel group delay and Q, and the SAR charge bucket and Cauer thermal ladder. Fill the eight TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T3.01a/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T3.01a -p 'test_*.py'
"""

import math

MU0 = 4.0 * math.pi * 1e-7  # H/m


def loop_inductance_nh(h_m, w_m, length_m, mu0=MU0):
    """The parallel-plate commutation loop inductance of a plane pair, in nH."""
    raise NotImplementedError("TODO 1: the inductance the plane pair presents over this length, in nanohenries")


def flux_cancelled_nh(l1_nh, l2_nh, m_nh):
    """The net loop inductance when supply and return carry anti-parallel currents."""
    raise NotImplementedError("TODO 2: the net inductance once the two currents oppose each other")


def turn_off_peak_v(v_bus, l_loop_nh, di_dt_a_per_ns):
    """The peak drain-source voltage at turn-off."""
    raise NotImplementedError("TODO 3: the peak the drain sees as this loop interrupts this slew")


def bessel_group_delay_us(f0_hz):
    """The low-frequency group delay of a 2nd-order Bessel filter, in microseconds."""
    raise NotImplementedError("TODO 4: the low-frequency delay this corner sets, in microseconds")


def bessel_q():
    """The Q of a 2nd-order Bessel filter."""
    raise NotImplementedError("TODO 5: the quality factor that keeps this filter's delay flat")


def charge_droop_fraction(c_sample_f, c_filt_f):
    """The t = 0+ droop fraction when the SAR switch closes."""
    raise NotImplementedError("TODO 6: how much of the step the sampling capacitor claims when the switch closes")


def charge_settling_lsb(bits, c_sample_f, c_filt_f, r_filt_ohm, t_acq_s):
    """Residual settling error in LSBs after t_acq."""
    raise NotImplementedError(
        "TODO 7: the residual error left at the end of the acquisition window, in LSBs"
    )


def cauer_junction_c(t_amb_c, p_loss_w, stages, t_s):
    """Junction temperature of a Cauer ladder under a rectangular pulse."""
    raise NotImplementedError("TODO 8: the junction temperature the ladder reaches by the end of the pulse")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
