"""Exercise 01-electronics.T2.01a - reference solution.

The bidirectional current-sense stage: the shunt drop centred on a mid-rail reference, the inverse
that recovers the current, the current at which the output clips, the gain error a 2-terminal
layout adds, CMRR as an input-referred error, and the 12-bit code the ADC reports.
"""

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def _check_stage(r_shunt, gain):
    if r_shunt <= 0.0:
        raise ValueError("a shunt resistance must be positive")
    if gain <= 0.0:
        raise ValueError("an amplifier gain must be positive")


def shunt_adc_voltage(i_amp, r_shunt, gain=20.0, v_ref=1.65):
    """V_ADC = V_ref + G * I * R_shunt, with the sign carried by the current."""
    _check_stage(r_shunt, gain)
    return v_ref + gain * i_amp * r_shunt


def shunt_current_from_adc(v_adc, r_shunt, gain=20.0, v_ref=1.65):
    """I = (V_ADC - V_ref) / (G R_shunt): the inverse of the stage, sign included."""
    _check_stage(r_shunt, gain)
    return (v_adc - v_ref) / (gain * r_shunt)


def max_measurable_current(v_ref, v_rail, gain, r_shunt):
    """The positive current that just reaches the rail: (V_rail - V_ref) / (G R)."""
    _check_stage(r_shunt, gain)
    if v_rail <= 0.0:
        raise ValueError("the ADC rail must be positive")
    if not 0.0 <= v_ref <= v_rail:
        raise ValueError("the reference must sit inside the ADC rail")
    return (v_rail - v_ref) / (gain * r_shunt)


def kelvin_gain_error_pct(r_shunt, r_trace):
    """100 * 2 R_trace / R_shunt: both pads' copper sits in series with the shunt element."""
    if r_shunt <= 0.0:
        raise ValueError("a shunt resistance must be positive")
    if r_trace < 0.0:
        raise ValueError("a trace resistance cannot be negative")
    return 100.0 * 2.0 * r_trace / r_shunt


def cmrr_input_error_v(delta_v_cm, cmrr_db):
    """The common-mode step, referred back to the amplifier input: dV * 10^(-CMRR/20)."""
    return delta_v_cm * 10.0 ** (-cmrr_db / 20.0)


def cmrr_current_error_a(delta_v_cm, cmrr_db, r_shunt):
    """The same residue as a misread current: input-referred volts over the shunt."""
    if r_shunt <= 0.0:
        raise ValueError("a shunt resistance must be positive")
    return cmrr_input_error_v(delta_v_cm, cmrr_db) / r_shunt


def adc_code(v_adc, v_rail=3.3, bits=12):
    """The unipolar code: rounded to the nearest count and clamped to [0, 2**bits - 1]."""
    if v_rail <= 0.0:
        raise ValueError("the ADC rail must be positive")
    if bits < 1:
        raise ValueError("an ADC needs at least one bit")
    full_scale = 2 ** bits - 1
    counts = int(round(v_adc / v_rail * full_scale))
    return max(0, min(full_scale, counts))


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
