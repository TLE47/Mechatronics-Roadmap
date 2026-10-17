"""Exercise 01-electronics.T1.01d - reference solution.

The RC time constant and the charging curve, the -3 dB corner it defines, the bulk capacitance a
droop budget demands, the energy stored in a capacitor and in a coil, and the flyback spike an
unprotected coil produces when its current is interrupted.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def rc_time_constant(r_ohm, c_farad):
    """tau = R C, in seconds."""
    if r_ohm <= 0.0 or c_farad <= 0.0:
        raise ValueError("a time constant needs a positive resistance and capacitance")
    return r_ohm * c_farad


def rc_voltage(t_s, v_in, r_ohm, c_farad):
    """V_C(t) = V_in (1 - exp(-t / RC)) for a capacitor charging from zero."""
    if t_s < 0.0:
        raise ValueError("time does not run backwards")
    return v_in * (1.0 - math.exp(-t_s / rc_time_constant(r_ohm, c_farad)))


def rc_cutoff_hz(r_ohm, c_farad):
    """fc = 1 / (2 pi R C): the -3 dB half-power corner."""
    return 1.0 / (2.0 * math.pi * rc_time_constant(r_ohm, c_farad))


def bulk_capacitance_f(delta_i, delta_t, delta_v):
    """C >= delta_I * delta_t / delta_V for a droop budget."""
    if delta_v <= 0.0:
        raise ValueError("a droop budget must be positive")
    if delta_t < 0.0:
        raise ValueError("the transient duration cannot be negative")
    return delta_i * delta_t / delta_v


def capacitor_energy(v_cap, c_farad):
    """E_C = 1/2 C V^2, in joules."""
    if c_farad < 0.0:
        raise ValueError("a capacitance cannot be negative")
    return 0.5 * c_farad * v_cap * v_cap


def inductor_energy(inductance_h, current):
    """E_L = 1/2 L I^2, in joules."""
    if inductance_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    return 0.5 * inductance_h * current * current


def flyback_voltage(inductance_h, current, dt_open_s):
    """The unclamped spike |V_L| = L dI/dt when a coil's current is interrupted in dt_open_s."""
    if dt_open_s <= 0.0:
        raise ValueError("interrupting a current takes a positive time")
    if inductance_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    return inductance_h * current / dt_open_s


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
