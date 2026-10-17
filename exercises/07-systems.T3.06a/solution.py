"""Exercise 07-systems.T3.06a - reference solution.

The arithmetic a factory acceptance audit asks for: the byte rate of an OPC UA PubSub stream, the
diagnostic coverage and common-cause failure a safety submodel reports, whether the result reaches
PLd, the Category 3 dual-channel STO evaluator, the AAS-to-NodeId map, and the reset interlock that
must never re-energise motion on its own.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def opc_ua_pubsub_rate_bps(n_vars, f_pub, header_bytes=14, value_bytes=8):
    """Payload byte rate of a cyclic PubSub frame: (header + n_vars * value_bytes) * f_pub."""
    if n_vars < 0 or f_pub < 0:
        raise ValueError("a variable count and a publish rate cannot be negative")
    if header_bytes < 0 or value_bytes <= 0:
        raise ValueError("the header is bytes and every variable needs a positive width")
    return (header_bytes + n_vars * value_bytes) * f_pub


def diagnostic_coverage_pct(lambda_dd, lambda_du):
    """DC_avg in percent: 100 * lambda_dd / (lambda_dd + lambda_du)."""
    if lambda_dd < 0.0 or lambda_du < 0.0:
        raise ValueError("a failure rate cannot be negative")
    total = lambda_dd + lambda_du
    if total == 0.0:
        raise ValueError("a subsystem with no failures at all has no diagnostic coverage")
    return 100.0 * lambda_dd / total


def pfh_common_cause(lambda_du, beta):
    """The common-cause contribution to PFH_d: beta * lambda_du, in failures per hour."""
    if lambda_du < 0.0:
        raise ValueError("a failure rate cannot be negative")
    if not 0.0 <= beta <= 1.0:
        raise ValueError("the common-cause factor is a fraction in [0, 1]")
    return beta * lambda_du


def pld_ok(pfh_d):
    """True when PFH_d is inside ISO 13849-1's PLd band [1e-7, 1e-6) per hour."""
    if pfh_d < 0.0:
        raise ValueError("a failure rate cannot be negative")
    return 1e-7 <= pfh_d < 1e-6


def sto_evaluate(ch_a_safe, ch_b_safe, discrepancy_ms, t_disc_max_ms=20.0):
    """Category 3 dual-channel STO: either channel cuts torque; a disagreement past t_disc latches."""
    if discrepancy_ms < 0.0:
        raise ValueError("a discrepancy time cannot be negative")
    if t_disc_max_ms < 0.0:
        raise ValueError("the discrepancy filter cannot be negative")
    torque_removed = ch_a_safe or ch_b_safe
    discrepancy_fault = (ch_a_safe != ch_b_safe) and (discrepancy_ms > t_disc_max_ms)
    can_enable = (not ch_a_safe) and (not ch_b_safe) and (not discrepancy_fault)
    return {"torque_removed": torque_removed,
            "discrepancy_fault": discrepancy_fault,
            "can_enable": can_enable}


def aas_opcua_nodes(shell):
    """Every SubmodelElement's `opcUaNodeId`, checked for the `ns=<n>;s=<path>` form AAS prescribes."""
    if not isinstance(shell, dict) or "submodels" not in shell:
        raise ValueError("an AAS shell carries a list of submodels")
    nodes = []
    for submodel in shell["submodels"]:
        for element in submodel.get("submodelElements", []):
            node_id = element.get("opcUaNodeId")
            if not isinstance(node_id, str) or not node_id.startswith("ns=") or ";" not in node_id:
                raise ValueError("every mapped element needs an `ns=<index>;<type>=<id>` NodeId")
            namespace, _, rest = node_id[3:].partition(";")
            if not namespace.isdigit() or not rest[:2] in ("i=", "s=", "g="):
                raise ValueError("NodeId %r is not `ns=<n>;i=|s=|g=<id>`" % node_id)
            nodes.append(node_id)
    return nodes


def reset_interlock(ch_a_safe, ch_b_safe, fault_latched, reset_pressed):
    """Restart needs both channels released and agreeing, no latched fault, and a deliberate press."""
    if ch_a_safe != ch_b_safe:
        return False
    if ch_a_safe:
        return False
    return bool(reset_pressed) and not fault_latched


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
