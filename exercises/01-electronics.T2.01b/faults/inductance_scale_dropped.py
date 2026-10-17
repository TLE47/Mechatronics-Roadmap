"""Planted fault: the nH/ns identity is broken by a stray 1e-9."""

import math  # noqa: F401

import mechalab_plant as plant  # noqa: F401


def v_peak_turnoff(v_bus, l_loop_nh, di_amp, dt_ns):
    if v_bus < 0.0:
        raise ValueError("the bus voltage cannot be negative")
    if l_loop_nh < 0.0:
        raise ValueError("a loop inductance cannot be negative")
    if dt_ns <= 0.0:
        raise ValueError("a commutation takes a positive time")
    # BUG: nH/ns is already an ohm; multiplying by 1e-9 makes the overshoot picovolts.
    return v_bus + l_loop_nh * 1e-9 * (di_amp / dt_ns)


def max_loop_inductance_nh(v_bus, v_peak_max, di_amp, dt_ns):
    if dt_ns <= 0.0:
        raise ValueError("a commutation takes a positive time")
    if di_amp <= 0.0:
        raise ValueError("there is no overshoot without a current change")
    headroom = v_peak_max - v_bus
    if headroom <= 0.0:
        raise ValueError("a ceiling at or below the bus leaves no headroom")
    return headroom * dt_ns / di_amp


def gate_drive_current_a(qg_nc, tr_ns):
    if qg_nc < 0.0:
        raise ValueError("a gate charge cannot be negative")
    if tr_ns <= 0.0:
        raise ValueError("a rise time must be positive")
    return qg_nc / tr_ns


def bootstrap_gate_v(v_sw, v_drv):
    if v_drv <= 0.0:
        raise ValueError("a gate driver needs a positive supply")
    return v_sw + v_drv


def precharge_peak_a(v_bus, r_pre):
    if v_bus < 0.0:
        raise ValueError("the bus voltage cannot be negative")
    if r_pre <= 0.0:
        raise ValueError("pre-charging needs a resistor, not a short")
    return v_bus / r_pre


def precharge_time_s(r_pre, c_bus, taus=5.0):
    if r_pre <= 0.0 or c_bus <= 0.0:
        raise ValueError("a time constant needs a positive resistance and capacitance")
    if taus <= 0.0:
        raise ValueError("a settle time needs a positive number of time constants")
    return taus * r_pre * c_bus


def bus_energy_j(c_bus, v_bus):
    if c_bus < 0.0:
        raise ValueError("a capacitance cannot be negative")
    return 0.5 * c_bus * v_bus * v_bus
