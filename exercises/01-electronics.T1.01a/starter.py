"""Exercise 01-electronics.T1.01a - the learner's file.

Ohm's law, the loaded and unloaded divider, Joule heating, the LED resistor, the LED current and
the derating check. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01a/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01a -p 'test_*.py'
"""

import mechalab_plant as plant


def stall_current(v_supply, r_winding):
    """The current a stalled winding draws from this supply."""
    raise NotImplementedError("TODO 1: the current a stalled winding draws, and a zero winding is an error")


def divider_unloaded(v_in, r1, r2):
    """The midpoint of an unloaded divider."""
    raise NotImplementedError("TODO 2: the midpoint voltage of the unloaded divider")


def divider_loaded(v_in, r1, r2, r_load):
    """The midpoint once the load draws current from it."""
    raise NotImplementedError("TODO 3: the midpoint once the load is connected")


def joule_power(current, resistance):
    """The heat this current dissipates in the resistance."""
    raise NotImplementedError("TODO 4: the heat this current dissipates every second")


def led_series_resistor(v_supply, v_led, i_target):
    """The resistor that sets the wanted LED current from this supply."""
    raise NotImplementedError("TODO 5: the resistor that gives the LED its target current from this supply")


def led_current(v_supply, v_led, resistance):
    """The current an already-chosen resistor allows."""
    raise NotImplementedError("TODO 6: the current this resistor allows")


def within_derating(p_dissipated, p_rated, derating=0.5):
    """True when the part runs at or below `derating` of its rating."""
    raise NotImplementedError("TODO 7: whether the part stays inside its derated budget")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
