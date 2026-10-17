"""Browser self-check for 01-electronics.T2.01b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(v_peak_turnoff(48.0, 20.0, 30.0, 20.0) - 78.0) < 1e-6, "the sloppy 2-layer board"
    assert abs(v_peak_turnoff(48.0, 4.0, 30.0, 20.0) - 54.0) < 1e-6, "the 4-layer plane"
    assert v_peak_turnoff(48.0, 20.0, 30.0, 20.0) > 75.0, "and it would break a 75 V FET"
    checks += 1

    assert abs(max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0) - 6.0) < 1e-12, "80% derating"
    checks += 1

    assert abs(gate_drive_current_a(30.0, 30.0) - 1.0) < 1e-12, "nC/ns is already an amp"
    assert abs(bootstrap_gate_v(48.0, 12.0) - 60.0) < 1e-12, "the gate rides the phase node"
    checks += 1

    assert abs(precharge_peak_a(48.0, 48.0) - 1.0) < 1e-12, "the t=0 inrush"
    assert abs(precharge_time_s(48.0, 1000e-6) - 0.24) < 1e-12, "five time constants"
    checks += 1

    assert abs(bus_energy_j(1000e-6, 48.0) - 1.152) < 1e-12, "1/2 C V^2"
    assert abs(bus_energy_j(0.0015, 48.0) - 1.728) < 1e-12
    checks += 1

    print("SELF-CHECK PASS: %d checks - the commutation overshoot and its inductance budget, the "
          "bootstrap gate voltage and gate current, the pre-charge inrush and settle time, and the "
          "stored bus energy" % checks)


_selfcheck()
