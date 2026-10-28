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
        "TODO 1: a full turn is two pi radians and a minute is sixty seconds, so convert revolutions per minute into radians per second"
    )


def prefix_scale(value, prefix):
    """A prefixed quantity in base SI units."""
    raise NotImplementedError("TODO 2: look the factor up in PREFIXES; refuse a prefix that is not there")


def trace_drop_v(current_a, resistance_ohm):
    """Voltage drop across a resistance."""
    raise NotImplementedError("TODO 3: Ohm's law across the trace; its resistance times the current through it")


def trace_loss_w(current_a, resistance_ohm):
    """Heat dissipated in a resistance."""
    raise NotImplementedError("TODO 4: I SQUARED R - 15 A through 12 mOhm is 2.7 W, not 0.18 W")


def rc_time_constant_s(resistance_ohm, capacitance_f):
    """RC time constant in seconds."""
    raise NotImplementedError("TODO 5: the resistance times the capacitance, once the capacitance is in farads")


def shaft_power_w(torque_nm, omega_rad_s):
    """Mechanical shaft power."""
    raise NotImplementedError(
        "TODO 6: torque times angular speed, and that speed must be in radians per second, so convert first"
    )


def loop_period_us(frequency_hz):
    """One control-loop period, in microseconds."""
    raise NotImplementedError("TODO 7: the period is one over the frequency in seconds; scale to microseconds, not ms")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
