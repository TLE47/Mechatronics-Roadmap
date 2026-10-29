"""Exercise 01-electronics.T1.01c - the learner's file.

A current-limited supply's CV/CC foldback, its critical resistance, the two DMM modes, the heat in a
breadboard clip, the LED current and the power-off short check. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01c/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01c -p 'test_*.py'
"""

import mechalab_plant as plant


def psu_output(v_set, i_limit, r_load):
    """(v_out, i_out, p_out, mode) for a CV/CC bench supply."""
    raise NotImplementedError(
        "TODO 1: the output the supply settles into when the load asks for more current than the limit allows"
    )


def critical_resistance(v_set, i_limit):
    """The load resistance at which the supply leaves constant-voltage mode."""
    raise NotImplementedError("TODO 2: the load where the supply reaches its current limit")


def dmm_voltage_loading_current(v_rail, r_in=10_000_000.0):
    """Current a voltmeter steals from the rail."""
    raise NotImplementedError("TODO 3: the current the meter itself takes from the rail")


def dmm_short_current(v_rail, r_shunt=0.010, r_leads=0.0):
    """The surge from a lead left in the current jack."""
    raise NotImplementedError("TODO 4: the surge a lead left in the current jack draws")


def clip_power(current, r_clip):
    """The heat dissipated in one breadboard spring clip."""
    raise NotImplementedError("TODO 5: the heat in the clip at this current")


def led_current_ma(v_supply, v_f, resistance):
    """Series LED current in milliamps."""
    raise NotImplementedError("TODO 6: the current through the LED, in milliamps")


def is_short(resistance, threshold=10.0):
    """True when the power-off check reads below the threshold."""
    raise NotImplementedError("TODO 7: whether the power-off check reads as a short")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
