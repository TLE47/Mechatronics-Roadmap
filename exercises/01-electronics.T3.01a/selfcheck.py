"""Browser self-check for 01-electronics.T3.01a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    six = loop_inductance_nh(0.00010, 0.012, 0.015)
    two = loop_inductance_nh(0.00160, 0.0020, 0.025)
    assert abs(six - 0.157079633) < 1e-9, "0.10 mm prepreg over a 12 mm plane"
    assert abs(two - 25.132741229) < 1e-6, "1.60 mm core over a 2 mm trace"
    assert abs(two / six - 160.0) < 1e-9, "the stackup, not the copper, sets the ratio"
    assert abs(turn_off_peak_v(48.0, six, 3.0) - 48.471238898) < 1e-9
    assert turn_off_peak_v(48.0, two, 3.0) > 120.0, "a 2-layer loop avalanches an 80 V FET"
    assert abs(flux_cancelled_nh(6.0, 6.0, 5.2) - 1.6) < 1e-12, "6 + 6 - 2(5.2)"
    checks += 1

    assert abs(bessel_group_delay_us(250_000.0) - 0.636619772) < 1e-9, "1 / (2 pi f0)"
    assert abs(bessel_group_delay_us(200_000.0) - 0.795774715) < 1e-9
    assert abs(bessel_q() - 1.0 / math.sqrt(3.0)) < 1e-12, "Q = 0.5774, not 0.7071"
    checks += 1

    assert abs(charge_droop_fraction(6e-12, 114e-12) - 0.05) < 1e-15, "the capacitors set t = 0+"
    late = charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 34.2e-9)
    assert abs(late - 0.507648446) < 1e-9, "0.5076 LSB at 34.2 ns - just over budget"
    assert charge_settling_lsb(12, 6e-12, 114e-12, 50.0, 35e-9) < 0.5
    broken = charge_settling_lsb(12, 6e-12, 114e-12, 10_000.0, 34.2e-9)
    assert abs(broken / late - 391.51) < 0.05, "a leftover 10 kOhm series resistor"
    checks += 1

    stages = [(0.45, 0.005), (2.5, 30.0)]
    junction = cauer_junction_c(25.0, 120.0, stages, 0.010)
    assert abs(junction - 71.791878) < 1e-6, "die +46.7 C, sink +0.1 C"
    assert junction < 125.0
    assert abs(cauer_junction_c(30.0, 20.0, [(0.5, 10.0), (0.2, 100.0), (2.3, 1000.0)], 1e5)
               - 90.0) < 1e-9, "steady state is the sum of the R_thetas"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the flux-cancelling loop inductance and its turn-off spike, "
          "the Bessel group delay and Q, the SAR charge bucket's droop and settling, and the Cauer "
          "junction temperature" % checks)


_selfcheck()
