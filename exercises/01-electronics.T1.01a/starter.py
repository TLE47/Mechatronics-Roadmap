"""Exercise 01-electronics.T1.01a - the learner's file.

Ohm's law, the loaded and unloaded divider, Joule heating, the LED resistor, the LED current and
the derating check. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01a/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01a -p 'test_*.py'
"""

import mechalab_plant as plant


def stall_current(v_supply, r_winding):
    """I = V / R for a stalled winding."""
    raise NotImplementedError("TODO 1: divide, and refuse a zero winding")


def divider_unloaded(v_in, r1, r2):
    """The midpoint of an unloaded divider."""
    raise NotImplementedError("TODO 2: the BOTTOM leg sets the fraction")


def divider_loaded(v_in, r1, r2, r_load):
    """The midpoint with a load in parallel with the bottom leg."""
    raise NotImplementedError("TODO 3: parallel the load with r2 first, then divide")


def joule_power(current, resistance):
    """P = I^2 R."""
    raise NotImplementedError("TODO 4: current SQUARED times resistance")


def led_series_resistor(v_supply, v_led, i_target):
    """KVL first: R = (V_supply - V_LED) / I."""
    raise NotImplementedError("TODO 5: subtract the LED's forward drop before dividing")


def led_current(v_supply, v_led, resistance):
    """The current an already-chosen resistor allows."""
    raise NotImplementedError("TODO 6: the same KVL, solved for current")


def within_derating(p_dissipated, p_rated, derating=0.5):
    """True when the part runs at or below `derating` of its rating."""
    raise NotImplementedError("TODO 7: compare against the derating fraction, not the full rating")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
