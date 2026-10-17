"""Browser self-check for 06-robotics.T1.06a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    q, qd, qdd = cubic_rest_to_rest(1.0, 0.0, 1.2, 2.0)
    assert abs(q - 0.6) < 1e-12 and abs(qd - 0.9) < 1e-12 and abs(qdd) < 1e-12, "the midpoint"
    assert abs(cubic_rest_to_rest(0.0, 0.0, 1.2, 2.0)[1]) < 1e-12, "zero starting speed"
    assert abs(cubic_rest_to_rest(2.0, 0.0, 1.2, 2.0)[0] - 1.2) < 1e-12, "the target is reached"
    assert abs(cubic_rest_to_rest(9.0, 0.0, 1.2, 2.0)[1]) < 1e-12, "and held still after"
    checks += 1

    a0, a1, a2, a3 = cubic_coefficients(0.3, 1.1, 1.6)
    for t in (0.0, 0.4, 1.6):
        poly = a0 + a1 * t + a2 * t * t + a3 * t ** 3
        assert abs(poly - cubic_rest_to_rest(t, 0.3, 1.1, 1.6)[0]) < 1e-12, "coefficients agree"
    assert abs(a1) < 1e-15 and abs(a1 + 2 * a2 * 1.6 + 3 * a3 * 1.6 ** 2) < 1e-12
    checks += 1

    assert abs(peak_velocity(2.0, 4.0) - 0.75) < 1e-12, "peak speed"
    assert abs(min_duration_s(2.0, 3.0) - 1.0) < 1e-12, "speed-limited duration"
    assert abs(min_duration_for_acceleration(2.0, 3.0) - 2.0) < 1e-12, "acceleration limit"
    checks += 1

    tau = spring_damper_torque(0.8, 0.7, 0.5, 0.2, 10.0, 1.0, 0.4)
    assert abs(tau - 1.7) < 1e-12, "the spring-damper plus gravity"
    assert abs(spring_damper_torque(0.4, 0.4, 0.0, 0.0, 8.0, 0.5, -1.2) + 1.2) < 1e-12
    assert abs(compliance_deflection(0.50, 5.0) - 0.10) < 1e-12, "the yield"
    assert compliance_deflection(0.5, 20.0) < compliance_deflection(0.5, 4.0)
    checks += 1

    print("SELF-CHECK PASS: %d checks - the rest-to-rest cubic, its coefficients, the peak speed and "
          "both duration limits, the spring-damper and the compliance yield" % checks)


_selfcheck()
