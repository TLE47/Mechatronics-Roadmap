"""Exercise 07-systems.T3.06a - the learner's file.

OPC UA's byte rate, the AAS NodeId map, diagnostic coverage and common-cause PFH, the PLd band,
the Category 3 STO evaluator and the reset interlock. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/07-systems.T3.06a/starter.py \
        python3 -m unittest discover -s exercises/07-systems.T3.06a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def opc_ua_pubsub_rate_bps(n_vars, f_pub, header_bytes=14, value_bytes=8):
    """Cyclic PubSub payload byte rate."""
    raise NotImplementedError("TODO 1: the 14-byte header is per FRAME, not per variable")


def diagnostic_coverage_pct(lambda_dd, lambda_du):
    """DC_avg in percent."""
    raise NotImplementedError("TODO 2: a percentage, so multiply by 100")


def pfh_common_cause(lambda_du, beta):
    """beta * lambda_du, in failures per hour."""
    raise NotImplementedError("TODO 3: the CCF term is per channel, not per subsystem twice over")


def pld_ok(pfh_d):
    """True inside the PLd band [1e-7, 1e-6)."""
    raise NotImplementedError("TODO 4: the upper bound is exclusive")


def sto_evaluate(ch_a_safe, ch_b_safe, discrepancy_ms, t_disc_max_ms=20.0):
    """The Category 3 STO decision for one sample."""
    raise NotImplementedError("TODO 5: a skew under t_disc is normal contact bounce, not a fault")


def aas_opcua_nodes(shell):
    """Every SubmodelElement's NodeId, validated."""
    raise NotImplementedError("TODO 6: check `ns=<n>;` then `i=`, `s=` or `g=`")


def reset_interlock(ch_a_safe, ch_b_safe, fault_latched, reset_pressed):
    """Whether a restart may be granted."""
    raise NotImplementedError("TODO 7: no automatic restart, and never past a latched fault")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
