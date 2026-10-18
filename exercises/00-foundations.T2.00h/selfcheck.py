"""Browser self-check for 00-foundations.T2.00h.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    z = impedance_rl(3.0, 0.004, 1000.0)
    assert abs(z) - 5.0 < 1e-9 and abs(phase_deg(z) - 53.13010235415598) < 1e-9, "winding impedance"
    checks += 1

    h = first_order_response(0.01, 100.0)
    assert abs(abs(h) - 1.0 / math.sqrt(2.0)) < 1e-12, "cutoff magnitude"
    assert abs(phase_deg(h) + 45.0) < 1e-9, "cutoff phase"
    assert abs(magnitude_db(h) + 3.0103) < 1e-4, "cutoff in dB"
    checks += 1

    g = second_order_response(100.0, 0.05, 100.0)
    assert abs(abs(g) - 10.0) < 1e-9, "resonance gain"
    assert abs(magnitude_db(g) - 20.0) < 1e-9, "resonance dB"
    assert abs(phase_deg(g) + 90.0) < 1e-9, "resonance phase"
    checks += 1

    g10 = second_order_response(100.0, 0.05, 1000.0)
    assert abs(magnitude_db(g10) + 39.9127) < 1e-3, "a decade above resonance"
    assert abs(phase_deg(g10) + 179.4213) < 1e-3, "phase a decade above"
    checks += 1

    assert abs(magnitude_db(10.0) - 20.0) < 1e-12, "20 log10, not 10 log10"
    assert abs(magnitude_db(0.1) + 20.0) < 1e-12, "amplitude decibels"
    assert abs(phase_deg(-1.0j) + 90.0) < 1e-12, "degrees at the Bode boundary"
    checks += 1

    omega_r, peak = resonance_peak(100.0, 0.2)
    assert abs(omega_r - 100.0 * math.sqrt(1.0 - 2.0 * 0.04)) < 1e-9, "peak frequency"
    at_peak = abs(second_order_response(100.0, 0.2, omega_r))
    assert abs(at_peak - peak) < 1e-6, "the peak is a point on the curve"
    assert resonance_peak(100.0, 0.9) == (0.0, 1.0), "no peak when overdamped enough"
    checks += 1

    print("SELF-CHECK PASS: %d checks - winding impedance, first order, resonance, decade rolloff, "
          "decibels, peak location" % checks)


_selfcheck()
