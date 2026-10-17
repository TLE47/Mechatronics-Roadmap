"""Browser self-check for 00-foundations.T1.00c.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    # 2400 RPM is 80*pi rad/s; 60 RPM is one turn per second.
    assert math.isclose(rpm_to_rad_s(2400.0), 80.0 * math.pi, rel_tol=1e-12), "RPM to rad/s"
    assert math.isclose(rpm_to_rad_s(60.0), 2.0 * math.pi, rel_tol=1e-12), "one turn per second"
    checks += 1

    # 450 mN*m is 0.45 N*m; 100 nF is 1e-7 F.
    assert math.isclose(prefix_scale(450.0, "m"), 0.45, rel_tol=1e-12), "milli"
    assert math.isclose(prefix_scale(100.0, "n"), 1e-7, rel_tol=1e-12), "nano"
    assert math.isclose(prefix_scale(10.0, "k"), 10e3, rel_tol=1e-12), "kilo"
    checks += 1

    # 15 A through 12 mOhm drops 0.18 V and burns 2.7 W - the square is the difference.
    assert math.isclose(trace_drop_v(15.0, 12e-3), 0.18, rel_tol=1e-12), "V = IR"
    assert math.isclose(trace_loss_w(15.0, 12e-3), 2.70, rel_tol=1e-12), "P = I^2 R"
    checks += 1

    # 10 kOhm * 100 nF is 1 ms, and 0.45 N*m at 80*pi rad/s is 113.0973355 W.
    assert math.isclose(rc_time_constant_s(10e3, 100e-9), 1.0e-3, rel_tol=1e-12), "tau_RC"
    assert math.isclose(shaft_power_w(0.45, rpm_to_rad_s(2400.0)), 113.0973355, rel_tol=1e-9), "P=tw"
    checks += 1

    # A 25 kHz FOC loop ticks every 40 us.
    assert math.isclose(loop_period_us(25_000.0), 40.0, rel_tol=1e-12), "T_s in us"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the RPM-to-rad/s factor, the SI prefixes, the trace's IR drop "
          "and I^2 R loss, the RC time constant, shaft power and the loop period in microseconds"
          % checks)


_selfcheck()
