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
        "TODO 1: fold back into constant current as soon as the load would draw more than the limit at the set voltage"
    )


def critical_resistance(v_set, i_limit):
    """R_crit = V_set / I_limit."""
    raise NotImplementedError("TODO 2: the limit is a current, so divide the voltage by it")


def dmm_voltage_loading_current(v_rail, r_in=10_000_000.0):
    """Current a voltmeter steals from the rail."""
    raise NotImplementedError("TODO 3: a ten-megaohm meter barely loads the rail, so the stolen current is tiny: divide")


def dmm_short_current(v_rail, r_shunt=0.010, r_leads=0.0):
    """The surge from a lead left in the current jack."""
    raise NotImplementedError("TODO 4: the SHUNT is the resistance here, not the 10 Mohm input")


def clip_power(current, r_clip):
    """P = I^2 R in one breadboard clip."""
    raise NotImplementedError("TODO 5: squared")


def led_current_ma(v_supply, v_f, resistance):
    """Series LED current in milliamps."""
    raise NotImplementedError("TODO 6: subtract the forward drop, divide, then scale to mA")


def is_short(resistance, threshold=10.0):
    """True when the power-off check reads below the threshold."""
    raise NotImplementedError("TODO 7: below the threshold is a short, not above it")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
