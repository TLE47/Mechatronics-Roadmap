"""Planted fault: the watchdog window is one frame period, whatever `n_miss` says.

A single missed frame trips the watchdog, so a healthy link that drops one frame under load
declares itself dead - and the module's budget of three is never used.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def regen_energy_j(j_kg_m2, omega0_rad_s, efficiency):
    return efficiency * 0.5 * j_kg_m2 * omega0_rad_s * omega0_rad_s


def unclamped_bus_v(v_nom, energy_j, c_bus_f):
    if c_bus_f <= 0.0:
        raise ValueError("bus capacitance must be positive")
    return math.sqrt(v_nom * v_nom + 2.0 * energy_j / c_bus_f)


def brake_resistor_max_ohm(v_clamp, p_peak_w):
    if p_peak_w <= 0.0:
        raise ValueError("peak regenerative power must be positive")
    return v_clamp * v_clamp / p_peak_w


def brake_peak_current_a(v_clamp, r_ohm):
    return v_clamp / r_ohm


def rolling_counter_status(prev_count, curr_count, max_drop=2):
    delta = (curr_count - prev_count) % 16
    if delta == 1:
        return "OK"
    if delta == 0:
        return "FAULT_FROZEN"
    if delta - 1 <= max_drop:
        return "WARN_DROPPED_%d" % (delta - 1)
    return "FAULT_SEQ_JUMP"


def watchdog_timeout_s(n_miss, t_cmd_s):
    return t_cmd_s


def hil_coverage(passed, total):
    if total <= 0:
        raise ValueError("the fault catalog cannot be empty")
    return float(passed) / float(total)
