"""Browser self-check for 01-electronics.T1.01b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(conduction_loss(5.0, 0.010) - 0.25) < 1e-12, "I^2 R on-resistance loss"
    assert abs(conduction_loss(4.0, 0.020, 0.5) - 0.16) < 1e-12, "and the duty scales the average"
    checks += 1

    assert abs(pwm_effective_voltage(12.0, 0.75) - 9.0) < 1e-12
    assert abs(pwm_effective_voltage(12.0, 0.65) - 7.8) < 1e-12
    try:
        pwm_effective_voltage(12.0, 65.0)
    except ValueError:
        pass
    else:
        raise AssertionError("a percentage is not a duty fraction")
    checks += 1

    assert abs(shoot_through_current(12.0, 0.020) - 300.0) < 1e-9, "two switches in series"
    assert abs(shoot_through_current(24.0, 0.010) - 1200.0) < 1e-9
    checks += 1

    assert abs(h_bridge_voltage(12.0, 1.0, 0.0) - 12.0) < 1e-12, "forward"
    assert abs(h_bridge_voltage(24.0, 0.25, 0.75) + 12.0) < 1e-9, "reverse at half the bus"
    assert abs(bridge_conduction_loss(1.2, 0.18, 0.18) - 0.5184) < 1e-4, "two switches in the loop"
    checks += 1

    assert within_recommended(9.0) and within_recommended(10.8), "the recommended window"
    assert not within_recommended(11.8), "the absolute maximum is not an operating point"
    assert abs(duty_for_effective_voltage(9.0, 12.0) - 0.75) < 1e-12, "the duty round trip"
    checks += 1

    print("SELF-CHECK PASS: %d checks - conduction loss, the PWM average, the shoot-through current, "
          "the H-bridge's differential drive and the datasheet window" % checks)


_selfcheck()
