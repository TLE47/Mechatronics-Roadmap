"""Exercise 00-foundations.T1.00c - the learner's file.

Convert prefixed datasheet numbers into base SI units before doing arithmetic with them. Fill the
seven TODOs, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/00-foundations.T1.00c/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00c -p 'test_*.py'
"""

import math

PREFIXES = {
    "": 1.0,
    "k": 1e3,
    "M": 1e6,
    "m": 1e-3,
    "u": 1e-6,
    "\u00b5": 1e-6,
    "n": 1e-9,
}


def rpm_to_rad_s(rpm):
    """Revolutions per minute to radians per second."""
    raise NotImplementedError(
        "TODO 1: the same rotation rate in radians per second"
    )


def prefix_scale(value, prefix):
    """A prefixed quantity in base SI units."""
    raise NotImplementedError("TODO 2: the value in base units, and a prefix the table does not know is an error")


def trace_drop_v(current_a, resistance_ohm):
    """Voltage drop across a resistance."""
    raise NotImplementedError("TODO 3: the potential difference the current loses across this resistance")


def trace_loss_w(current_a, resistance_ohm):
    """Heat dissipated in a resistance."""
    raise NotImplementedError("TODO 4: the heat this current gives the trace every second")


def rc_time_constant_s(resistance_ohm, capacitance_f):
    """RC time constant in seconds."""
    raise NotImplementedError("TODO 5: how long this resistor and capacitor pair takes to respond, in seconds")


def shaft_power_w(torque_nm, omega_rad_s):
    """Mechanical shaft power."""
    raise NotImplementedError(
        "TODO 6: the mechanical power the shaft carries at this torque and speed"
    )


def loop_period_us(frequency_hz):
    """One control-loop period, in microseconds."""
    raise NotImplementedError("TODO 7: one control-loop period in microseconds")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
