"""Planted fault: the LED resistor divides the whole supply, not the drop across itself.

290 ohms becomes 500, and the LED runs at 5.8 mA instead of the 10 mA it was designed for.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def stall_current(v_supply, r_winding):
    """I = V / R for a stalled winding."""
    if r_winding <= 0.0:
        raise ValueError("a winding needs a positive resistance")
    return v_supply / r_winding


def divider_unloaded(v_in, r1, r2):
    """The midpoint of an unloaded divider; the BOTTOM leg sets the fraction."""
    if r1 <= 0.0 or r2 <= 0.0:
        raise ValueError("both legs need a positive resistance")
    return v_in * r2 / (r1 + r2)


def divider_loaded(v_in, r1, r2, r_load):
    """The midpoint with a load in parallel with the bottom leg - always at or below the unloaded."""
    if r_load <= 0.0:
        raise ValueError("a load needs a positive resistance")
    bottom = (r2 * r_load) / (r2 + r_load)
    return divider_unloaded(v_in, r1, bottom)


def joule_power(current, resistance):
    """P = I^2 R."""
    if resistance < 0.0:
        raise ValueError("a resistance cannot be negative")
    return current * current * resistance


def led_series_resistor(v_supply, v_led, i_target):
    """KVL first: R = (V_supply - V_LED) / I."""
    if i_target <= 0.0:
        raise ValueError("an LED needs a positive target current")
    if v_led > v_supply:
        raise ValueError("the LED's forward voltage exceeds the supply - it will not light")
    return v_supply / i_target


def led_current(v_supply, v_led, resistance):
    """The current an already-chosen resistor allows: (V_supply - V_LED) / R."""
    if resistance <= 0.0:
        raise ValueError("the series resistance must be positive")
    return max(0.0, (v_supply - v_led) / resistance)


def within_derating(p_dissipated, p_rated, derating=0.5):
    """True when the part runs at or below `derating` of its rating (half by default)."""
    if p_rated <= 0.0:
        raise ValueError("a resistor needs a positive rating")
    if not 0.0 < derating <= 1.0:
        raise ValueError("the derating fraction is in (0, 1]")
    return p_dissipated <= derating * p_rated


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
