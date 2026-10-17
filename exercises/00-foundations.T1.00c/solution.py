"""Exercise 00-foundations.T1.00c - reference solution.

The unit discipline the module asks for, as seven small functions: every prefixed datasheet number
is converted to base SI on entry, and the two conversions that cause the module's Common-mistakes
rows (RPM to rad/s, nanowatts to watts via the prefix table) live in exactly one place each.

    omega [rad/s] = RPM [rev/min] * (2*pi rad / 1 rev) * (1 min / 60 s)
    V_drop [V]    = I [A] * R [ohm]
    P_loss [W]    = I^2 [A^2] * R [ohm]
    tau_RC [s]    = R [ohm] * C [F]
    P_shaft [W]   = tau [N*m] * omega [rad/s]
    T_s [us]      = (1 / f [Hz]) * 1e6
"""

import math

# The engineering prefixes the module names, as (value in base units) per one prefixed unit.
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
    """omega = RPM * 2*pi / 60: revolutions per minute to radians per second."""
    return rpm * (2.0 * math.pi / 60.0)


def prefix_scale(value, prefix):
    """Convert a prefixed quantity into base SI units: 450 m -> 0.45, 100 n -> 1e-7."""
    try:
        factor = PREFIXES[prefix]
    except KeyError:
        raise ValueError("unknown SI prefix %r (known: %s)"
                         % (prefix, ", ".join(sorted(PREFIXES))))
    return value * factor


def trace_drop_v(current_a, resistance_ohm):
    """V_drop = I R, in volts, for a current already in amperes and a resistance in ohms."""
    if resistance_ohm < 0.0:
        raise ValueError("a resistance cannot be negative")
    return current_a * resistance_ohm


def trace_loss_w(current_a, resistance_ohm):
    """P_loss = I^2 R. The square is the whole point: 15 A through 12 mOhm burns 2.7 W, not 0.18 W."""
    if resistance_ohm < 0.0:
        raise ValueError("a resistance cannot be negative")
    return current_a * current_a * resistance_ohm


def rc_time_constant_s(resistance_ohm, capacitance_f):
    """tau_RC = R C. Ohms times farads is seconds: 10 kOhm * 100 nF = 1 ms."""
    if resistance_ohm <= 0.0:
        raise ValueError("a resistance must be positive")
    if capacitance_f <= 0.0:
        raise ValueError("a capacitance must be positive")
    return resistance_ohm * capacitance_f


def shaft_power_w(torque_nm, omega_rad_s):
    """P = tau omega, with omega in rad/s - never in RPM, which is 9.55x the wrong number."""
    return torque_nm * omega_rad_s


def loop_period_us(frequency_hz):
    """T_s = 1 / f, reported in microseconds: a 25 kHz loop ticks every 40 us, not every 0.04."""
    if frequency_hz <= 0.0:
        raise ValueError("a frequency must be positive")
    return 1e6 / frequency_hz


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
