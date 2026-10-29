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
    raise NotImplementedError("TODO 1: the energy the slowing rotor can return to the bus")


def unclamped_bus_v(v_nom, energy_j, c_bus_f):
    """Bus voltage the same energy would reach with no chopper."""
    raise NotImplementedError("TODO 2: the bus voltage that energy would reach with no chopper")


def brake_resistor_max_ohm(v_clamp, p_peak_w):
    """The largest resistor that can still dissipate `p_peak_w` at `v_clamp`."""
    raise NotImplementedError(
        "TODO 3: the largest brake resistor that still keeps the clamp's power within budget"
    )


def brake_peak_current_a(v_clamp, r_ohm):
    """Peak chopper current into the brake resistor."""
    raise NotImplementedError("TODO 4: the current the clamp voltage drives into this resistor")


def rolling_counter_status(prev_count, curr_count, max_drop=2):
    """Classify a 4-bit rolling counter step."""
    raise NotImplementedError("TODO 5: the verdict for this counter step, including a wrap past fifteen")


def watchdog_timeout_s(n_miss, t_cmd_s):
    """The window after which missed frames must trip the watchdog."""
    raise NotImplementedError("TODO 6: the window after which missed frames must trip the watchdog")


def hil_coverage(passed, total):
    """Fraction of the required fault modes that were injected and passed."""
    raise NotImplementedError(
        "TODO 7: how much of the fault catalogue was injected and passed; an empty catalogue is refused"
    )


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
