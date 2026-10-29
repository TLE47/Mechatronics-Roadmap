"""Exercise 08-capstones.T3.07a - the learner's file.

Three budgets and one gate: the RSS spatial error budget, the end-to-end latency that becomes
phase margin, and the five-domain Go/No-Go sign-off. Fill the nine TODOs:

    EXERCISE_TARGET=exercises/08-capstones.T3.07a/starter.py \
        python3 -m unittest discover -s exercises/08-capstones.T3.07a -p 'test_*.py'
"""

import math


def rss(sigmas):
    """The combined spread of independent 1-sigma contributions."""
    raise NotImplementedError("TODO 1: the combined spread of independent contributions, each quoted at one sigma")


def systematic_sum(biases):
    """The offset deterministic biases put on the budget."""
    raise NotImplementedError("TODO 2: the offset the biases put on the budget when some sit on the other side")


def error_budget_3sigma(biases, sigmas, sensitivities=None, nsig=3.0):
    """The total error at `nsig` standard deviations."""
    raise NotImplementedError(
        "TODO 3: the total error budget those systematic and random terms support at this sigma"
    )


def variance_fraction(index, sigmas, sensitivities=None):
    """The share of the budget's variance carried by term `i`."""
    raise NotImplementedError("TODO 4: this term's share of the budget's total variance")


def zoh_delay_us(ts_us):
    """The zero-order hold delay, in microseconds."""
    raise NotImplementedError("TODO 5: the delay the zero-order hold introduces, in microseconds")


def total_latency_s(tau_sens_us, tau_bus_us, tau_filt_us, tau_comp_us, ts_us):
    """The whole chain's latency, with the hold included, in seconds."""
    raise NotImplementedError("TODO 6: the whole chain's latency in seconds, with the hold included")


def net_phase_margin_deg(pm0_deg, w_gc_rad_s, tau_total_s):
    """The phase margin left after the loop's total delay, in degrees."""
    raise NotImplementedError("TODO 7: the margin left after the loop's total delay, in degrees")


def max_allowable_delay_ms(dphi_max_rad, w_gc_rad_s):
    """The delay a phase budget buys, in milliseconds."""
    raise NotImplementedError("TODO 8: the delay that spends the whole phase budget, in milliseconds")


def capstone_signoff(e_3sig_mm, pm_net_deg, cpu_u, can_ohm, sto_cat3_ok,
                     e_spec_mm=0.50, pm_min_deg=45.0, cpu_max=0.70,
                     can_min_ohm=55.0, can_max_ohm=65.0):
    """GO only when every one of the five domains passes."""
    raise NotImplementedError(
        "TODO 9: GO only when all five domains pass, with each limit inclusive at its own boundary"
    )


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
