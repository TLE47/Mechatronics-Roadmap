"""Exercise 07-systems.T1.07a - the learner's file.

The scan rate, the series NC chain, the latching state machine, gain in decibels, phase lag, the
lock-in amplitude and the inverse of the decibel scale. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/07-systems.T1.07a/starter.py \
        python3 -m unittest discover -s exercises/07-systems.T1.07a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def scan_frequency_hz(t_read_ms, t_exec_ms, t_write_ms):
    """The scan rate a Read -> Execute -> Write budget allows."""
    raise NotImplementedError("TODO 1: the budget is in ms, the answer in Hz")


def safety_chain_ok(*contacts):
    """True only when every series NC contact is closed."""
    raise NotImplementedError("TODO 2: ONE open contact must drop the enable — every contact closed, not any")


def plc_scan_step(state, estop1_nc, estop2_nc, door_nc, start_btn_no, reset_btn_no):
    """One cyclic scan: (next state, power enable)."""
    raise NotImplementedError("TODO 3: a trip latches; only a reset while Start is released clears it")


def gain_db(amplitude_out, amplitude_in):
    """Empirical magnitude in decibels."""
    raise NotImplementedError("TODO 4: amplitude ratios are 20 log10, not 10 log10")


def phase_lag_deg(f_hz, delay_s):
    """Phase lag in degrees for a peak delayed by `delay_s`."""
    raise NotImplementedError("TODO 5: a LAG is negative")


def sine_amplitude(samples, f_hz, dt_s):
    """Lock-in amplitude at one frequency."""
    raise NotImplementedError("TODO 6: correlate the samples against a sine and a cosine, then combine the two means into a magnitude")


def db_to_ratio(db):
    """Invert the decibel scale."""
    raise NotImplementedError("TODO 7: the decibel scale solved backwards, for amplitude rather than power")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
