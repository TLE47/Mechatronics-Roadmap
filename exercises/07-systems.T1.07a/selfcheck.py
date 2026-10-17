"""Browser self-check for 07-systems.T1.07a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(scan_frequency_hz(0.40, 1.10, 0.50) - 500.0) < 1e-9, "the scan budget is in ms"
    assert safety_chain_ok(1, 1, 1) and not safety_chain_ok(1, 1, 0), "one open contact drops it"
    checks += 1

    state, power = plc_scan_step("IDLE", 1, 1, 1, True, False)
    assert (state, power) == ("RUNNING", True)
    state, power = plc_scan_step(state, 1, 0, 1, False, False)
    assert (state, power) == ("ESTOP_LATCHED", False), "a wire break latches"
    state, power = plc_scan_step(state, 1, 1, 1, True, False)
    assert (state, power) == ("ESTOP_LATCHED", False), "no automatic restart"
    state, power = plc_scan_step(state, 1, 1, 1, False, True)
    assert (state, power) == ("IDLE", False), "a reset with Start released clears it"
    checks += 1

    assert abs(gain_db(0.10, 0.20) - (-6.0206)) < 1e-3, "20 log10 of a half"
    assert abs(gain_db(1.0, 1.0)) < 1e-12
    assert abs(phase_lag_deg(8.0, 0.03125) - (-90.0)) < 1e-9, "a quarter period of lag"
    checks += 1

    f, dt, amp = 5.0, 0.001, 0.35
    samples = [amp * math.sin(2.0 * math.pi * f * k * dt) for k in range(1000)]
    assert abs(sine_amplitude(samples, f, dt) - amp) < 1e-9, "the lock-in recovers the amplitude"
    assert abs(db_to_ratio(gain_db(0.5, 1.0)) - 0.5) < 1e-12, "the decibel inverse"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the scan rate, the series NC chain, the latching PLC state "
          "machine, gain in decibels, phase lag and the lock-in amplitude" % checks)


_selfcheck()
