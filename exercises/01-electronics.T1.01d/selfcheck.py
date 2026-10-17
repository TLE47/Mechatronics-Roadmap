"""Browser self-check for 01-electronics.T1.01d.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(rc_time_constant(10_000.0, 0.1e-6) - 1e-3) < 1e-15, "tau = RC"
    assert abs(rc_time_constant(4700.0, 10e-6) - 0.047) < 1e-15
    assert abs(rc_cutoff_hz(10_000.0, 0.1e-6) - 159.154943) < 1e-5, "and the corner it sets"
    checks += 1

    assert abs(rc_voltage(1e-3, 3.3, 10_000.0, 0.1e-6) - 2.085998) < 1e-6, "63% at one tau"
    assert abs(rc_voltage(5e-3, 3.3, 10_000.0, 0.1e-6) - 3.277765) < 1e-6, "99.3% at five"
    checks += 1

    assert abs(bulk_capacitance_f(3.0, 20e-6, 0.25) - 2.4e-4) < 1e-15, "the 240 uF budget"
    assert abs(bulk_capacitance_f(3.0, 20e-6, 0.6) - 1.0e-4) < 1e-15, "a 100 uF part sags 0.6 V"
    try:
        bulk_capacitance_f(3.0, 20e-6, 0.0)
    except ValueError:
        pass
    else:
        raise AssertionError("a droop budget must be positive")
    checks += 1

    assert abs(capacitor_energy(12.0, 100e-6) - 0.0072) < 1e-15, "1/2 C V^2"
    assert abs(inductor_energy(0.003, 2.0) - 0.006) < 1e-15, "1/2 L I^2"
    checks += 1

    spike = flyback_voltage(0.003, 2.0, 0.5e-6)
    assert abs(spike - 12_000.0) < 1e-6, "the unclamped kick"
    assert spike > 500.0 * (12.0 + 0.7), "and the diode clamps it to the bus"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the RC time constant and corner, the charging curve, the "
          "droop budget, both stored energies and the flyback spike" % checks)


_selfcheck()
