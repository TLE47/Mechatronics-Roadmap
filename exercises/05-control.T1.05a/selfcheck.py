"""Browser self-check for 05-control.T1.05a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, no loops, one
PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(tracking_error(1.57, 1.27) - 0.30) < 1e-12, "reference minus measurement"
    assert abs(control_effort(1.0, 0.6, 0.5, 0.8, 10.0, 2.0) - 3.8) < 1e-12, "the worked demand"
    assert abs(control_effort(2.0, 1.5, 0.4, 0.0, 10.0, 2.5) - 4.0) < 1e-12, "the skip test"
    checks += 1

    assert abs(steady_state_sag(0.60, 8.0) - 0.075) < 1e-12, "tau_g / Kp"
    assert abs(1.0 - steady_state_sag(0.60, 8.0) - 0.925) < 1e-12, "the exercise angle"
    assert abs(steady_state_sag(0.50, 5.0) - 0.10) < 1e-12
    checks += 1

    assert abs(saturate(18.5, 12.0) - 12.0) < 1e-12, "the positive rail"
    assert abs(saturate(-18.5, 12.0) + 12.0) < 1e-12, "the negative rail"
    assert abs(saturate(5.0, 12.0) - 5.0) < 1e-15, "inside the rails"
    checks += 1

    assert abs(integral_step(0.0, 20.0, 0.25, 0.001) - 0.005) < 1e-15, "Ki e dt"
    assert abs(anti_windup_integral(0.8, 12.0, 0.4, 0.001, 15.0, 12.0) - 0.8) < 1e-15, "freeze"
    assert abs(anti_windup_integral(0.8, 12.0, 0.4, 0.001, 10.0, 12.0) - 0.8048) < 1e-15
    # The error has reversed while the demand is still past the rail: the loop is unwinding, so
    # the tick must land (0.8 - 0.0048) rather than stay frozen at 0.8.
    assert abs(anti_windup_integral(0.8, 12.0, -0.4, 0.001, 15.0, 12.0) - 0.7952) < 1e-15, \
        "expected 0.7952: the error reversed while the demand is still past the positive rail, so the tick must land (a freeze on every saturation gives 0.8)"
    # The same two cases on the negative rail: e = -1 with u_raw = -15 freezes, e = +1 unwinds.
    assert abs(anti_windup_integral(0.8, 12.0, -0.4, 0.001, -15.0, 12.0) - 0.8) < 1e-15, \
        "expected the freeze at 0.8: 15 N*m of demand past the negative rail with the error still pushing down"
    assert abs(anti_windup_integral(0.8, 12.0, 0.4, 0.001, -15.0, 12.0) - 0.8048) < 1e-15, \
        "expected 0.8048: the error opposes the negative demand, so the accumulator must unwind"
    # Exactly on the rail is not past it: both boundary ticks land.
    assert abs(anti_windup_integral(0.8, 12.0, 0.4, 0.001, 12.0, 12.0) - 0.8048) < 1e-15, \
        "expected 0.8048: u_raw == u_max is at the limit, not past it - check the strict comparison"
    assert abs(anti_windup_integral(0.8, 12.0, -0.4, 0.001, -12.0, 12.0) - 0.7952) < 1e-15, \
        "expected 0.7952: -u_max is the limit too, so the tick lands"
    checks += 1

    assert abs(arm_acceleration(1.20, 0.0, 0.60, 0.02, 0.05) - 30.0) < 1e-12, "the worked arm"
    assert abs(arm_acceleration(1.20, 2.0, 0.60, 0.02, 0.05) - 25.0) < 1e-12, "damping removed"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the tracking error, the spring-damper-plus-bias demand, the "
          "gravity sag, both saturation rails, the integral tick with its anti-windup freeze on "
          "both rails, the unwind when the error reverses, the exact-boundary tick, and the "
          "arm's acceleration" % checks)


_selfcheck()
