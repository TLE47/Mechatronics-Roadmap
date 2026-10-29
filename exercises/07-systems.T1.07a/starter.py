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
    raise NotImplementedError("TODO 1: the scan rate this total budget supports")


def safety_chain_ok(*contacts):
    """True only when every series NC contact is closed."""
    raise NotImplementedError("TODO 2: whether the chain still enables with these contacts")


def plc_scan_step(state, estop1_nc, estop2_nc, door_nc, start_btn_no, reset_btn_no):
    """One cyclic scan: (next state, power enable)."""
    raise NotImplementedError("TODO 3: the next state and whether power stays enabled after this scan")


def gain_db(amplitude_out, amplitude_in):
    """Empirical magnitude in decibels."""
    raise NotImplementedError("TODO 4: the gain on the amplitude decibel scale")


def phase_lag_deg(f_hz, delay_s):
    """Phase lag in degrees for a peak delayed by `delay_s`."""
    raise NotImplementedError("TODO 5: the phase delay in degrees at this frequency")


def sine_amplitude(samples, f_hz, dt_s):
    """Lock-in amplitude at one frequency."""
    raise NotImplementedError("TODO 6: the amplitude of this frequency in the samples")


def db_to_ratio(db):
    """Invert the decibel scale."""
    raise NotImplementedError("TODO 7: the amplitude ratio a decibel reading represents")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
