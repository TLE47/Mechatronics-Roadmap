"""Fault: a 12-bit ADC is scaled by 4096 counts instead of 4095.

3.15 V lands on 3910 rather than 3909, and full scale would read one count past the largest code.
"""

import mechalab_plant as plant  # noqa: F401


def _check_stage(r_shunt, gain):
    if r_shunt <= 0.0:
        raise ValueError("a shunt resistance must be positive")
    if gain <= 0.0:
        raise ValueError("an amplifier gain must be positive")


def shunt_adc_voltage(i_amp, r_shunt, gain=20.0, v_ref=1.65):
    _check_stage(r_shunt, gain)
    return v_ref + gain * i_amp * r_shunt


def shunt_current_from_adc(v_adc, r_shunt, gain=20.0, v_ref=1.65):
    _check_stage(r_shunt, gain)
    return (v_adc - v_ref) / (gain * r_shunt)


def max_measurable_current(v_ref, v_rail, gain, r_shunt):
    _check_stage(r_shunt, gain)
    if v_rail <= 0.0:
        raise ValueError("the ADC rail must be positive")
    if not 0.0 <= v_ref <= v_rail:
        raise ValueError("the reference must sit inside the ADC rail")
    return (v_rail - v_ref) / (gain * r_shunt)


def kelvin_gain_error_pct(r_shunt, r_trace):
    if r_shunt <= 0.0:
        raise ValueError("a shunt resistance must be positive")
    if r_trace < 0.0:
        raise ValueError("a trace resistance cannot be negative")
    return 100.0 * 2.0 * r_trace / r_shunt


def cmrr_input_error_v(delta_v_cm, cmrr_db):
    return delta_v_cm * 10.0 ** (-cmrr_db / 20.0)


def cmrr_current_error_a(delta_v_cm, cmrr_db, r_shunt):
    if r_shunt <= 0.0:
        raise ValueError("a shunt resistance must be positive")
    return cmrr_input_error_v(delta_v_cm, cmrr_db) / r_shunt


def adc_code(v_adc, v_rail=3.3, bits=12):
    if v_rail <= 0.0:
        raise ValueError("the ADC rail must be positive")
    if bits < 1:
        raise ValueError("an ADC needs at least one bit")
    full_scale = 2 ** bits
    counts = int(round(v_adc / v_rail * full_scale))
    return max(0, min(full_scale, counts))
