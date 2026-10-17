"""Exercise 01-electronics.T2.01b - reference solution.

The commutation-loop voltage spike and the inductance a FET ceiling allows, the bootstrap gate
voltage that rides the switching node, and the pre-charge that fills a 48 V capacitor bank.

Every helper keeps the module's engineering units on the outside (nH, ns, nC) and relies on the one
identity the module teaches: nH/ns = 1 ohm, so L[nH] * dI[A] / dt[ns] is already a volt.
"""

import math  # noqa: F401  (kept so the submission imports what the module uses)

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def v_peak_turnoff(v_bus, l_loop_nh, di_amp, dt_ns):
    """V_peak = V_bus + L_loop dI/dt, with L in nH and dt in ns (nH/ns = 1 ohm)."""
    if v_bus < 0.0:
        raise ValueError("the bus voltage cannot be negative")
    if l_loop_nh < 0.0:
        raise ValueError("a loop inductance cannot be negative")
    if dt_ns <= 0.0:
        raise ValueError("a commutation takes a positive time")
    return v_bus + l_loop_nh * (di_amp / dt_ns)


def max_loop_inductance_nh(v_bus, v_peak_max, di_amp, dt_ns):
    """The largest loop inductance whose overshoot still fits under v_peak_max."""
    if dt_ns <= 0.0:
        raise ValueError("a commutation takes a positive time")
    if di_amp <= 0.0:
        raise ValueError("there is no overshoot without a current change")
    headroom = v_peak_max - v_bus
    if headroom <= 0.0:
        raise ValueError("a ceiling at or below the bus leaves no headroom")
    return headroom * dt_ns / di_amp


def gate_drive_current_a(qg_nc, tr_ns):
    """I_G = Q_g / t_r, with Q_g in nC and t_r in ns (nC/ns = 1 A)."""
    if qg_nc < 0.0:
        raise ValueError("a gate charge cannot be negative")
    if tr_ns <= 0.0:
        raise ValueError("a rise time must be positive")
    return qg_nc / tr_ns


def bootstrap_gate_v(v_sw, v_drv):
    """V_G = V_SW + V_drv: the bootstrap capacitor rides on top of the phase node."""
    if v_drv <= 0.0:
        raise ValueError("a gate driver needs a positive supply")
    return v_sw + v_drv


def precharge_peak_a(v_bus, r_pre):
    """I_pre,peak = V_bus / R_pre, the t = 0 inrush into an uncharged bank."""
    if v_bus < 0.0:
        raise ValueError("the bus voltage cannot be negative")
    if r_pre <= 0.0:
        raise ValueError("pre-charging needs a resistor, not a short")
    return v_bus / r_pre


def precharge_time_s(r_pre, c_bus, taus=5.0):
    """The settle time t = taus R C; five time constants is the module's 99.3% point."""
    if r_pre <= 0.0 or c_bus <= 0.0:
        raise ValueError("a time constant needs a positive resistance and capacitance")
    if taus <= 0.0:
        raise ValueError("a settle time needs a positive number of time constants")
    return taus * r_pre * c_bus


def bus_energy_j(c_bus, v_bus):
    """E = 1/2 C V^2, the energy stored in the bank - and the energy the pre-charge burns."""
    if c_bus < 0.0:
        raise ValueError("a capacitance cannot be negative")
    return 0.5 * c_bus * v_bus * v_bus


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
