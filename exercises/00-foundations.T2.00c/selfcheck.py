"""Browser self-check for 00-foundations.T2.00c.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(first_order_response(0.010, 0.010) - (1.0 - math.exp(-1))) < 1e-12, "63.2% at tau"
    assert first_order_response(0.0, 0.02) == 0.0, "starts at zero"
    checks += 1

    p = second_order_params(0.02, 8.0, 0.40)
    assert abs(p["wn"] - 20.0) < 1e-9, "wn"
    assert abs(p["zeta"] - 0.50) < 1e-9, "zeta"
    assert abs(p["wd"] - 20.0 * math.sqrt(0.75)) < 1e-9, "wd"
    assert abs(p["mp"] - 0.16303) < 1e-5, "overshoot"
    checks += 1

    assert abs(critical_damping(0.02, 8.0) - 0.80) < 1e-12, "b_crit = 2 sqrt(J k)"
    assert second_order_params(0.02, 8.0, 0.80)["zeta"] == 1.0 or \
        abs(second_order_params(0.02, 8.0, 0.80)["zeta"] - 1.0) < 1e-12, "critical is zeta = 1"
    checks += 1

    assert abs(settling_time(20.0, 0.7) - 4.0 / 14.0) < 1e-12, "2% settling time"
    refused = False
    try:
        settling_time(20.0, 0.0)
    except ValueError:
        refused = True
    assert refused, "an undamped system never settles - refuse it"
    checks += 1

    sim = simulate_step(0.02, 8.0, 0.40, 1e-4, 10000)
    assert abs(sim["mp"] - p["mp"]) < 0.001, "simulated overshoot matches the formula"
    assert abs(simulate_step(0.02, 8.0, 0.80, 1e-4, 20000)["mp"]) < 1e-6, "critical damping"
    checks += 1

    limit = max_stable_dt(0.02, 8.0)
    assert abs(limit - 0.1) < 1e-12, "2 / wn"
    assert abs(simulate_step(0.02, 8.0, 0.0, 0.9 * limit, 4000)["max_theta"]) < 10.0, "stable below the limit"
    assert abs(simulate_step(0.02, 8.0, 0.0, 1.5 * limit, 4000)["max_theta"]) > 100.0, "unstable above it"
    checks += 1

    print("SELF-CHECK PASS: %d checks - first order, wn/zeta, critical damping, settling, "
          "simulation, stability limit" % checks)


_selfcheck()
