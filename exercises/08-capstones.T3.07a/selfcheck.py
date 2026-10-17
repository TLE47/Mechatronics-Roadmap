"""Browser self-check for 08-capstones.T3.07a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    sigmas = (0.03, 0.06, 0.08, 0.03)
    assert abs(rss(sigmas) - 0.1086278) < 1e-7, "root-sum-square, not the linear sum"
    assert abs(rss((0.03, 0.04, 0.12)) - 0.13) < 1e-12, "0.0169 under the root"
    assert abs(systematic_sum((0.01, 0.04, 0.03, 0.02)) - 0.10) < 1e-12, "biases add linearly"
    assert abs(error_budget_3sigma((0.05,), (0.06, 0.08)) - 0.35) < 1e-12, "3 sigma of 0.10"
    assert abs(variance_fraction(2, (0.03, 0.04, 0.12)) - 144.0 / 169.0) < 1e-12, "variance share"
    checks += 1

    assert abs(zoh_delay_us(1000.0) - 500.0) < 1e-12, "half a tick"
    assert abs(total_latency_s(20.0, 180.0, 250.0, 150.0, 1000.0) - 0.0011) < 1e-15, "1100 us"
    checks += 1

    assert abs(net_phase_margin_deg(62.0, 150.0, 0.0011) - 52.546196) < 1e-6, "radians to degrees"
    assert abs(net_phase_margin_deg(62.0, 150.0, 0.0034) - 32.779152) < 1e-6, "the filter swap"
    assert abs(max_allowable_delay_ms(0.20, 200.0) - 1.0) < 1e-12, "0.20 rad at 200 rad/s"
    checks += 1

    assert capstone_signoff(0.4258834, 52.546196, 0.42, 60.0, True) is True, "all five pass"
    assert capstone_signoff(0.4258834, 32.779152, 0.42, 60.0, True) is False, "phase margin"
    assert capstone_signoff(0.20, 52.5, 0.42, 60.0, False) is False, "four out of five is no-go"
    assert capstone_signoff(0.20, 52.5, 0.42, 50.0, True) is False, "termination window"
    assert capstone_signoff(0.50, 45.0, 0.70, 65.0, True) is True, "inclusive boundaries"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the RSS spatial budget with its dominant source, the "
          "latency chain including the zero-order hold, the phase margin it erodes in degrees, "
          "and the five-domain sign-off" % checks)


_selfcheck()
