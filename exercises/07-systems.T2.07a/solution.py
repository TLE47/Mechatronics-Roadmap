"""Exercise 07-systems.T2.07a - reference solution.

Three safety mechanisms, each with one number that decides whether the machine is safe: the energy
a decelerating rotor pushes back into the bus, the resistor that can absorb it, and the counter that
tells a frozen frame from a dropped one. The counter's check is modular: `(curr - prev) % 16`, never
a plain difference, because a rollover from 15 to 0 is the most common valid step there is.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def regen_energy_j(j_kg_m2, omega0_rad_s, efficiency):
    """Energy pushed back into the bus by a rotor slowing from `omega0` to rest."""
    return efficiency * 0.5 * j_kg_m2 * omega0_rad_s * omega0_rad_s


def unclamped_bus_v(v_nom, energy_j, c_bus_f):
    """Bus voltage the same energy would reach with no chopper: `sqrt(V^2 + 2E/C)`."""
    if c_bus_f <= 0.0:
        raise ValueError("bus capacitance must be positive")
    return math.sqrt(v_nom * v_nom + 2.0 * energy_j / c_bus_f)


def brake_resistor_max_ohm(v_clamp, p_peak_w):
    """The largest resistor that can still dissipate `p_peak_w` at `v_clamp`."""
    if p_peak_w <= 0.0:
        raise ValueError("peak regenerative power must be positive")
    return v_clamp * v_clamp / p_peak_w


def brake_peak_current_a(v_clamp, r_ohm):
    """Peak chopper current into the brake resistor."""
    return v_clamp / r_ohm


def rolling_counter_status(prev_count, curr_count, max_drop=2):
    """Classify a 4-bit rolling counter step: OK, frozen, dropped n, or a sequence jump."""
    delta = (curr_count - prev_count) % 16
    if delta == 1:
        return "OK"
    if delta == 0:
        return "FAULT_FROZEN"
    if delta - 1 <= max_drop:
        return "WARN_DROPPED_%d" % (delta - 1)
    return "FAULT_SEQ_JUMP"


def watchdog_timeout_s(n_miss, t_cmd_s):
    """The window after which `n_miss` consecutive missed frames must trip the watchdog."""
    return n_miss * t_cmd_s


def hil_coverage(passed, total):
    """Fraction of the required fault modes that were injected and passed."""
    if total <= 0:
        raise ValueError("the fault catalog cannot be empty")
    return float(passed) / float(total)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
