"""Exercise 07-systems.T2.07a - the learner's file.

Regenerative energy, the chopper's resistor, the rolling counter and the watchdog. Fill the seven
TODOs:

    EXERCISE_TARGET=exercises/07-systems.T2.07a/starter.py \
        python3 -m unittest discover -s exercises/07-systems.T2.07a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def regen_energy_j(j_kg_m2, omega0_rad_s, efficiency):
    """Energy pushed back into the bus by a rotor slowing to rest."""
    raise NotImplementedError("TODO 1: one half J omega squared, times the efficiency")


def unclamped_bus_v(v_nom, energy_j, c_bus_f):
    """Bus voltage the same energy would reach with no chopper."""
    raise NotImplementedError("TODO 2: the capacitor energy is quadratic in voltage, so invert the square")


def brake_resistor_max_ohm(v_clamp, p_peak_w):
    """The largest resistor that can still dissipate `p_peak_w` at `v_clamp`."""
    raise NotImplementedError("TODO 3: P = V^2 / R, solved for R - an upper bound, not a target")


def brake_peak_current_a(v_clamp, r_ohm):
    """Peak chopper current into the brake resistor."""
    raise NotImplementedError("TODO 4: Ohm's law, at full clamp voltage")


def rolling_counter_status(prev_count, curr_count, max_drop=2):
    """Classify a 4-bit rolling counter step."""
    raise NotImplementedError("TODO 5: the step is modular (mod 16); 0 is frozen, 1 is OK")


def watchdog_timeout_s(n_miss, t_cmd_s):
    """The window after which missed frames must trip the watchdog."""
    raise NotImplementedError("TODO 6: the budget is frames times the frame period")


def hil_coverage(passed, total):
    """Fraction of the required fault modes that were injected and passed."""
    raise NotImplementedError("TODO 7: a ratio - and refuse an empty catalog")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
