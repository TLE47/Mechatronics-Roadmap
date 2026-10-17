"""Planted fault: the current-jack short divides by the voltmeter's 10 Mohm input.

1200 A reads as 1.2 microamps - the exact confusion the module warns about, and the reason a lead
left in the 10 A jack is the classic fuse-blower.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def psu_output(v_set, i_limit, r_load):
    """(v_out, i_out, p_out, mode) for a CV/CC bench supply: fold back at i_limit."""
    if v_set < 0.0:
        raise ValueError("the voltage setting cannot be negative")
    if i_limit <= 0.0:
        raise ValueError("the current limit must be positive - it is the whole safety feature")
    if r_load <= 0.0:
        raise ValueError("a load resistance must be positive")
    unclamped = v_set / r_load
    if unclamped <= i_limit:
        return v_set, unclamped, v_set * unclamped, "CV"
    v_out = i_limit * r_load
    return v_out, i_limit, v_out * i_limit, "CC"


def critical_resistance(v_set, i_limit):
    """R_crit = V_set / I_limit: below this the supply folds back into CC."""
    if v_set < 0.0:
        raise ValueError("the voltage setting cannot be negative")
    if i_limit <= 0.0:
        raise ValueError("the current limit must be positive")
    return v_set / i_limit


def dmm_voltage_loading_current(v_rail, r_in=10_000_000.0):
    """Current a voltmeter steals from the rail it is probing: V / R_in."""
    if r_in <= 0.0:
        raise ValueError("a voltmeter needs a positive input resistance")
    return v_rail / r_in


def dmm_short_current(v_rail, r_shunt=0.010, r_leads=0.0):
    """The surge a lead left in the current jack makes across a rail: V / (shunt + leads)."""
    total = r_shunt + r_leads
    if r_shunt <= 0.0:
        raise ValueError("a current shunt must be positive")
    if r_leads < 0.0:
        raise ValueError("lead resistance cannot be negative")
    return v_rail / 10_000_000.0


def clip_power(current, r_clip):
    """P = I^2 R in one breadboard spring clip."""
    if r_clip < 0.0:
        raise ValueError("a contact resistance cannot be negative")
    return current * current * r_clip


def led_current_ma(v_supply, v_f, resistance):
    """Series LED current in milliamps: (V_supply - V_f) / R * 1000."""
    if resistance <= 0.0:
        raise ValueError("the series resistance must be positive")
    return max(0.0, (v_supply - v_f) / resistance) * 1000.0


def is_short(resistance, threshold=10.0):
    """True when a power-off resistance check reads below the threshold - do not power on."""
    if resistance < 0.0:
        raise ValueError("a resistance cannot be negative")
    if threshold <= 0.0:
        raise ValueError("the short threshold must be positive")
    return resistance < threshold


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
