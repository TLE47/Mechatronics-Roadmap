"""Exercise 08-capstones.T3.07a - reference solution.

The three budgets a capstone carries into first power-up: a sensitivity-weighted root-sum-square
spatial error budget, an end-to-end latency budget whose microseconds are spent as phase margin,
and the five-domain Go/No-Go sign-off that gates energised closed-loop testing.
"""

import math


def _floats(values, name):
    """A non-empty list of plain, finite numbers, or a ValueError naming the argument."""
    if not isinstance(values, (list, tuple)):
        raise ValueError("%s must be a list of numbers" % name)
    out = []
    for value in values:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("%s must hold plain numbers, not %r" % (name, value))
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("%s must be finite" % name)
        out.append(value)
    return out


def rss(sigmas):
    """The root-sum-square of independent 1-sigma contributions: sqrt(sum sigma_i^2)."""
    values = _floats(sigmas, "sigmas")
    if not values:
        raise ValueError("an error budget needs at least one source")
    if any(value < 0.0 for value in values):
        raise ValueError("a 1-sigma contribution is a magnitude, never negative")
    return math.sqrt(sum(value * value for value in values))


def systematic_sum(biases):
    """Deterministic offsets add linearly, and they add in magnitude however signed they are."""
    values = _floats(biases, "biases")
    if not values:
        raise ValueError("an error budget needs at least one source")
    return sum(abs(value) for value in values)


def error_budget_3sigma(biases, sigmas, sensitivities=None, nsig=3.0):
    """e = sum |s_i b_i| + nsig * sqrt(sum (s_i sigma_i)^2), in the inputs' own unit."""
    bias_values = _floats(biases, "biases")
    sigma_values = _floats(sigmas, "sigmas")
    # The two lists are independent sums (one systematic offset against any number of random
    # sources), so they need not pair up: a single 0.05 mm bias may face two sigma sources.
    if not bias_values or not sigma_values:
        raise ValueError("an error budget needs at least one source")
    if sensitivities is None:
        bias_gains = [1.0] * len(bias_values)
        sigma_gains = [1.0] * len(sigma_values)
    else:
        gains = _floats(sensitivities, "sensitivities")
        if len(gains) != max(len(bias_values), len(sigma_values)):
            raise ValueError("one sensitivity per source; a shorter list cannot pair with it")
        bias_gains = gains[:len(bias_values)]
        sigma_gains = gains[:len(sigma_values)]
    if nsig < 0.0:
        raise ValueError("a coverage factor cannot be negative")
    systematic = systematic_sum([gain * bias for gain, bias in zip(bias_gains, bias_values)])
    random_part = rss([gain * sigma for gain, sigma in zip(sigma_gains, sigma_values)])
    return systematic + nsig * random_part


def variance_fraction(index, sigmas, sensitivities=None):
    """w_i = (s_i sigma_i)^2 / sum_j (s_j sigma_j)^2 - which source owns the variance."""
    values = _floats(sigmas, "sigmas")
    if not values:
        raise ValueError("an error budget needs at least one source")
    if sensitivities is None:
        gains = [1.0] * len(values)
    else:
        gains = _floats(sensitivities, "sensitivities")
        if len(gains) != len(values):
            raise ValueError("one sensitivity per source")
    if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(values):
        raise ValueError("%r is not a source in this budget" % (index,))
    contributions = [(gain * sigma) ** 2 for gain, sigma in zip(gains, values)]
    total = sum(contributions)
    if total <= 0.0:
        raise ValueError("a budget of zero variance has no dominant source")
    return contributions[index] / total


def zoh_delay_us(ts_us):
    """The zero-order hold costs half a sample period of delay."""
    if not math.isfinite(ts_us) or ts_us <= 0.0:
        raise ValueError("a loop needs a positive sample period")
    return 0.5 * ts_us


def total_latency_s(tau_sens_us, tau_bus_us, tau_filt_us, tau_comp_us, ts_us):
    """Every delay in the chain plus half a sample period of ZOH, in seconds."""
    for name, value in (("sensor", tau_sens_us), ("bus", tau_bus_us), ("filter", tau_filt_us),
                        ("compute", tau_comp_us)):
        if not math.isfinite(value) or value < 0.0:
            raise ValueError("the %s delay cannot be negative" % name)
    return (tau_sens_us + tau_bus_us + tau_filt_us + tau_comp_us + zoh_delay_us(ts_us)) * 1e-6


def net_phase_margin_deg(pm0_deg, w_gc_rad_s, tau_total_s):
    """PM_net = PM_0 - omega_gc tau (180/pi): a radian of lag is 57.3 degrees."""
    if not math.isfinite(w_gc_rad_s) or w_gc_rad_s < 0.0:
        raise ValueError("crossover is a positive frequency")
    if not math.isfinite(tau_total_s) or tau_total_s < 0.0:
        raise ValueError("delay cannot be negative")
    return pm0_deg - w_gc_rad_s * tau_total_s * (180.0 / math.pi)


def max_allowable_delay_ms(dphi_max_rad, w_gc_rad_s):
    """tau_max = dphi_max / omega_gc, reported in milliseconds."""
    if not math.isfinite(w_gc_rad_s) or w_gc_rad_s <= 0.0:
        raise ValueError("crossover must be a positive frequency")
    if not math.isfinite(dphi_max_rad) or dphi_max_rad < 0.0:
        raise ValueError("a phase budget is a magnitude")
    return (dphi_max_rad / w_gc_rad_s) * 1e3


def capstone_signoff(e_3sig_mm, pm_net_deg, cpu_u, can_ohm, sto_cat3_ok,
                     e_spec_mm=0.50, pm_min_deg=45.0, cpu_max=0.70,
                     can_min_ohm=55.0, can_max_ohm=65.0):
    """GO only when all five domains pass simultaneously; four out of five is NO-GO."""
    if not isinstance(sto_cat3_ok, bool):
        raise ValueError("the STO result is a verified yes or no, not a stand-in")
    if not 0.0 < e_spec_mm or not 0.0 < pm_min_deg or not 0.0 < cpu_max <= 1.0:
        raise ValueError("the spec limits must be positive fractions")
    if can_min_ohm >= can_max_ohm:
        raise ValueError("the termination window is empty")
    return (
        e_3sig_mm <= e_spec_mm
        and pm_net_deg >= pm_min_deg
        and cpu_u <= cpu_max
        and can_min_ohm <= can_ohm <= can_max_ohm
        and sto_cat3_ok
    )


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
