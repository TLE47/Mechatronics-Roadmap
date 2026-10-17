"""Browser self-check for 01-electronics.T1.01c.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    v_out, i_out, p_out, mode = psu_output(12.0, 0.20, 0.25)
    assert mode == "CC", "a 0.25 ohm miswire is 48 A asked for, not 0.2"
    assert abs(v_out - 0.05) < 1e-12 and abs(i_out - 0.20) < 1e-12 and abs(p_out - 0.01) < 1e-12
    _v, _i, p_battery, mode_battery = psu_output(12.0, 50.0, 0.25)
    assert mode_battery == "CV" and abs(p_battery - 576.0) < 1e-9, "no limit, no protection"
    checks += 1

    v_cv, i_cv, p_cv, mode_cv = psu_output(12.0, 0.10, 240.0)
    assert mode_cv == "CV" and abs(v_cv - 12.0) < 1e-12 and abs(i_cv - 0.05) < 1e-12
    assert abs(p_cv - 0.6) < 1e-12, "a healthy idle board"
    assert abs(critical_resistance(12.0, 0.10) - 120.0) < 1e-12
    checks += 1

    assert abs(dmm_voltage_loading_current(12.0) - 1.2e-6) < 1e-18, "the voltmeter barely loads"
    assert abs(dmm_short_current(12.0) - 1200.0) < 1e-9, "the current jack is a dead short"
    assert abs(dmm_short_current(24.0, 0.010, 0.010) - 1200.0) < 1e-9
    checks += 1

    assert abs(clip_power(5.0, 0.12) - 3.0) < 1e-9, "I^2 R in one spring clip"
    assert abs(led_current_ma(5.0, 2.0, 300.0) - 10.0) < 1e-9, "the LED's series current"
    checks += 1

    assert is_short(5.0) and not is_short(240.0), "the power-off resistance check"
    assert not is_short(10.0), "the threshold itself is not a short"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the CV/CC foldback, the critical resistance, both DMM "
          "modes, the clip's heat and the power-off short check" % checks)


_selfcheck()
