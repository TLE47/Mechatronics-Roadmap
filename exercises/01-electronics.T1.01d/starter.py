"""Exercise 01-electronics.T1.01d - the learner's file.

The RC time constant, the charging curve, the -3 dB corner, the bulk capacitance a droop budget
needs, the two stored energies and the flyback spike. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01d/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01d -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def rc_time_constant(r_ohm, c_farad):
    """tau = R C."""
    raise NotImplementedError("TODO 1: multiply; the farads are already farads here")


def rc_voltage(t_s, v_in, r_ohm, c_farad):
    """V_C(t) for a capacitor charging from zero."""
    raise NotImplementedError("TODO 2: an exponential approach to the supply, never a straight ramp")


def rc_cutoff_hz(r_ohm, c_farad):
    """fc = 1 / (2 pi R C)."""
    raise NotImplementedError("TODO 3: the 2 pi belongs in the denominator")


def bulk_capacitance_f(delta_i, delta_t, delta_v):
    """C >= delta_I * delta_t / delta_V."""
    raise NotImplementedError("TODO 4: the transient TIME is in the numerator")


def capacitor_energy(v_cap, c_farad):
    """E_C = 1/2 C V^2."""
    raise NotImplementedError("TODO 5: the half, and the voltage squared")


def inductor_energy(inductance_h, current):
    """E_L = 1/2 L I^2."""
    raise NotImplementedError("TODO 6: the half, and the current squared")


def flyback_voltage(inductance_h, current, dt_open_s):
    """The unclamped spike when the current is interrupted."""
    raise NotImplementedError("TODO 7: inductance times current over the open time in SECONDS — half a microsecond")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
