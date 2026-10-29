"""Exercise 01-electronics.T1.01d - the learner's file.

The RC time constant, the charging curve, the -3 dB corner, the bulk capacitance a droop budget
needs, the two stored energies and the flyback spike. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01d/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01d -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def rc_time_constant(r_ohm, c_farad):
    """How long this resistor-capacitor pair takes to respond, in seconds."""
    raise NotImplementedError("TODO 1: the pair's time constant, in seconds")


def rc_voltage(t_s, v_in, r_ohm, c_farad):
    """V_C(t) for a capacitor charging from zero."""
    raise NotImplementedError("TODO 2: the capacitor's voltage at this time after the supply is connected")


def rc_cutoff_hz(r_ohm, c_farad):
    """The frequency where this filter's output is down to its half-power point."""
    raise NotImplementedError("TODO 3: the corner frequency of this RC filter, in hertz")


def bulk_capacitance_f(delta_i, delta_t, delta_v):
    """The smallest reservoir that holds the rail within this droop budget."""
    raise NotImplementedError("TODO 4: the capacitance that keeps the rail inside the droop budget during this transient")


def capacitor_energy(v_cap, c_farad):
    """The energy this capacitor stores at this voltage, in joules."""
    raise NotImplementedError("TODO 5: the energy stored at this voltage")


def inductor_energy(inductance_h, current):
    """The energy this coil stores at this current, in joules."""
    raise NotImplementedError("TODO 6: the energy stored at this current")


def flyback_voltage(inductance_h, current, dt_open_s):
    """The unclamped spike when the current is interrupted."""
    raise NotImplementedError("TODO 7: the unclamped spike when this current is interrupted, with the opening time in seconds — a microsecond is a millionth of a second, not a thousandth")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
