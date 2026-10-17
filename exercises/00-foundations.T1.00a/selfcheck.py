"""Browser self-check for 00-foundations.T1.00a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(step_position(0.0, 0.5, 0.25) - 0.125) < 1e-12, "one 0.25 s tick"
    assert abs(step_position(0.25, 0.5, 0.25) - 0.375) < 1e-12, "right-hand side first"
    assert steps_to_target(0.0, 0.5, 0.25, 1.0) == 8, "eight ticks to 1.0 m"
    checks += 1

    assert abs(battery_voltage_after_steps(12.0, 0.15, 10) - 10.5) < 1e-6, "ten drops"
    assert abs(battery_voltage_after_steps(12.0, 0.15, 0) - 12.0) < 1e-12, "range(0)"
    checks += 1

    assert loop_total(4) == 12, "0 + 2 + 4 + 6"
    assert loop_total(0) == 0, "an empty range"
    assert clamp_pwm(1.35, 1.0) == 1.0, "the skip test's clamp"
    assert clamp_pwm(0.40, 1.0) == 0.40, "inside the ceiling"
    checks += 1

    assert safe_divide(1.0, 0.0) == (None, "ZeroDivisionError"), "the caught exception's name"
    assert safe_divide(1.0, 0.25) == (4.0, ""), "a clean division"
    assert format_position(1.0) == "1.000", "three decimals"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the position update and its step count, the battery sag "
          "over range(n), the Skip test's accumulator and clamp, the caught exception's name and "
          "the three-decimal format" % checks)


_selfcheck()
