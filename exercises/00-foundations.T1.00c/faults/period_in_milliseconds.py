"""Planted fault: the loop period is scaled by 1e3, so microseconds are reported as milliseconds.

A 25 kHz FOC loop reads 0.04 us instead of 40 us - the module's own Skip-test Q3 with the prefix
applied the wrong way.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
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
    """omega = RPM * 2*pi / 60."""
    return rpm * (2.0 * math.pi / 60.0)


def prefix_scale(value, prefix):
    """Convert a prefixed quantity into base SI units."""
    try:
        factor = PREFIXES[prefix]
    except KeyError:
        raise ValueError("unknown SI prefix %r (known: %s)"
                         % (prefix, ", ".join(sorted(PREFIXES))))
    return value * factor


def trace_drop_v(current_a, resistance_ohm):
    """V_drop = I R."""
    if resistance_ohm < 0.0:
        raise ValueError("a resistance cannot be negative")
    return current_a * resistance_ohm


def trace_loss_w(current_a, resistance_ohm):
    """P_loss = I^2 R."""
    if resistance_ohm < 0.0:
        raise ValueError("a resistance cannot be negative")
    return current_a * current_a * resistance_ohm


def rc_time_constant_s(resistance_ohm, capacitance_f):
    """tau_RC = R C."""
    if resistance_ohm <= 0.0:
        raise ValueError("a resistance must be positive")
    if capacitance_f <= 0.0:
        raise ValueError("a capacitance must be positive")
    return resistance_ohm * capacitance_f


def shaft_power_w(torque_nm, omega_rad_s):
    """P = tau omega."""
    return torque_nm * omega_rad_s


def loop_period_us(frequency_hz):
    """T_s = 1 / f, reported in microseconds."""
    if frequency_hz <= 0.0:
        raise ValueError("a frequency must be positive")
    return 1e3 / frequency_hz
