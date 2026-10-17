"""Browser self-check for 00-foundations.T1.00e.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(spring_force(50.0, 0.10) + 5.0) < 1e-12, "Hooke's law pulls back"
    assert abs(acceleration(-5.0, 2.0) + 2.5) < 1e-15, "Newton's second law"
    checks += 1

    # The Skip test's single 10 ms step: v1 = -0.2 m/s, x1 = 0.198 m.
    x1, v1 = euler_step(0.20, 0.0, 100.0, 0.0, 1.0, 0.01)
    assert abs(v1 + 0.2) < 1e-12 and abs(x1 - 0.198) < 1e-12, "velocity first, then position"
    # The exercised damped run: 2 s at b = 4 leaves 0.0046 J of the 0.25 J release energy.
    x, v = 0.10, 0.0
    for _ in range(4000):
        x, v = euler_step(x, v, 50.0, 4.0, 2.0, 0.0005)
    e_final = mechanical_energy(2.0, v, 50.0, x)
    assert e_final < 0.0125, "over 5% of the energy survived: check the -b*v sign"
    checks += 1

    assert abs(mechanical_energy(2.0, 0.0, 50.0, 0.10) - 0.25) < 1e-15, "release energy"
    assert abs(mechanical_energy(1.0, 2.0, 40.0, 0.10) - 2.20) < 1e-12, "both stores add"
    checks += 1

    assert abs(peak_speed(0.25, 2.0) - 0.5) < 1e-15, "peak speed 0.5 m/s"
    checks += 1

    assert abs(torque(2.0 * 9.81, 0.30, math.pi / 2.0) - 5.886) < 1e-9, "holding torque"
    assert abs(torque(10.0, 0.40, math.radians(30.0)) - 2.0) < 1e-12, "sin, not cos"
    checks += 1

    assert abs(angular_acceleration(1.5, 0.05) - 30.0) < 1e-9, "tau = J alpha"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the spring force, the symplectic and damped steps, the two "
          "energy stores, the peak speed, the lever torque and the angular acceleration" % checks)


_selfcheck()
