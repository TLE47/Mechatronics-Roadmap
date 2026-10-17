"""Exercise 08-capstones.T3.07a - the learner's file.

Three budgets and one gate: the RSS spatial error budget, the end-to-end latency that becomes
phase margin, and the five-domain Go/No-Go sign-off. Fill the nine TODOs:

    EXERCISE_TARGET=exercises/08-capstones.T3.07a/starter.py \
        python3 -m unittest discover -s exercises/08-capstones.T3.07a -p 'test_*.py'
"""

import math


def rss(sigmas):
    """The root-sum-square of independent 1-sigma contributions."""
    raise NotImplementedError("TODO 1: square, sum, then ONE square root - not the sum itself")


def systematic_sum(biases):
    """Deterministic offsets add linearly."""
    raise NotImplementedError("TODO 2: abs() first, either - a bias on the other side is not a credit")


def error_budget_3sigma(biases, sigmas, sensitivities=None, nsig=3.0):
    """e = sum |s_i b_i| + nsig * sqrt(sum (s_i sigma_i)^2)."""
    raise NotImplementedError(
        "TODO 3: systematic terms add as magnitudes, random terms add in quadrature, then scale"
    )


def variance_fraction(index, sigmas, sensitivities=None):
    """w_i = (s_i sigma_i)^2 / sum_j (s_j sigma_j)^2."""
    raise NotImplementedError("TODO 4: variance, not sigma - the squares are what add to one")


def zoh_delay_us(ts_us):
    """The zero-order hold delay, in microseconds."""
    raise NotImplementedError("TODO 5: half a sample period, not a whole one")


def total_latency_s(tau_sens_us, tau_bus_us, tau_filt_us, tau_comp_us, ts_us):
    """Every delay plus the ZOH, in seconds."""
    raise NotImplementedError("TODO 6: four delays PLUS half a tick, then microseconds to seconds")


def net_phase_margin_deg(pm0_deg, w_gc_rad_s, tau_total_s):
    """PM_net = PM_0 - omega_gc * tau_total, in degrees."""
    raise NotImplementedError("TODO 7: the product is in RADIANS - multiply by 180/pi")


def max_allowable_delay_ms(dphi_max_rad, w_gc_rad_s):
    """The delay a phase budget buys, in milliseconds."""
    raise NotImplementedError("TODO 8: divide the phase budget by crossover, then scale to ms")


def capstone_signoff(e_3sig_mm, pm_net_deg, cpu_u, can_ohm, sto_cat3_ok,
                     e_spec_mm=0.50, pm_min_deg=45.0, cpu_max=0.70,
                     can_min_ohm=55.0, can_max_ohm=65.0):
    """GO only when every one of the five domains passes."""
    raise NotImplementedError(
        "TODO 9: four gates AND the STO - and the limits are inclusive at their own boundary"
    )


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
