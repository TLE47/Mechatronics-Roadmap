"""Exercise 01-electronics.T2.01b - the learner's file.

The turn-off voltage spike across the commutation loop, the inductance budget a FET ceiling allows,
the bootstrap gate voltage, and the 48 V pre-charge: peak inrush, settle time and stored energy.

    EXERCISE_TARGET=exercises/01-electronics.T2.01b/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T2.01b -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def v_peak_turnoff(v_bus, l_loop_nh, di_amp, dt_ns):
    """The peak drain-source voltage at turn-off."""
    raise NotImplementedError("TODO 1: the peak the bus sees when this loop interrupts this current")


def max_loop_inductance_nh(v_bus, v_peak_max, di_amp, dt_ns):
    """The largest loop inductance that stays under a ceiling."""
    raise NotImplementedError("TODO 2: the largest loop that keeps the peak inside this ceiling")


def gate_drive_current_a(qg_nc, tr_ns):
    """The average gate drive current."""
    raise NotImplementedError("TODO 3: the current the gate needs to make this transition")


def bootstrap_gate_v(v_sw, v_drv):
    """The absolute gate voltage of a high-side N-MOSFET."""
    raise NotImplementedError("TODO 4: the gate voltage the high-side device sees")


def precharge_peak_a(v_bus, r_pre):
    """The t = 0 inrush into an uncharged bank."""
    raise NotImplementedError("TODO 5: the inrush at the instant the pre-charge starts")


def precharge_time_s(r_pre, c_bus, taus=5.0):
    """The pre-charge settle time."""
    raise NotImplementedError("TODO 6: the time the bank takes to settle")


def bus_energy_j(c_bus, v_bus):
    """The energy stored in the capacitor bank."""
    raise NotImplementedError("TODO 7: the energy the bank stores at this voltage")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
