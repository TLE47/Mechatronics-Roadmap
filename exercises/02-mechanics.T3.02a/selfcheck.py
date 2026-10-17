"""Browser self-check for 02-mechanics.T3.02a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    axis = screw_axis([0.0, 1.0, 0.0], [0.40, 0.0, 0.10])
    assert abs(axis[3] + 0.10) < 1e-12, "v = -omega x q, sign included"
    assert abs(axis[5] - 0.40) < 1e-12
    assert abs(screw_axis([0.0, 0.0, 1.0], [0.30, 0.0, 0.0])[4] + 0.30) < 1e-12
    checks += 1

    assert abs(spatial_power([0.0, 0.0, 2.0, 0.5, 0.0, 0.0],
                             [0.0, 0.0, 3.0, 10.0, 0.0, 0.0]) - 11.0) < 1e-12, "both halves"
    assert abs(spatial_power([0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
                             [0.0, 0.0, 2.0, 3.0, 0.0, 0.0]) - 2.0) < 1e-12, "pure rotation"
    checks += 1

    k = flexure_stiffness(114e9, 0.015, 0.001, 0.005)
    assert abs(k - 54.0940) < 1e-4, "Paros-Weisbord"
    sigma = flexure_stress(k, math.radians(0.50), 0.015, 0.001, 0.005)
    assert abs(sigma / 1e6 - 207.706) < 1e-2, "concentration factor included"
    checks += 1

    assert abs(thickness_scale(2.0) - 5.656854249492381) < 1e-12, "t^(5/2)"
    checks += 1

    tau1, tau2 = rnea_2link(0.05, 0.02, 2.0, 1.0)
    assert abs(tau2 - 0.06) < 1e-12 and abs(tau1 - 0.16) < 1e-12, "inward pass"
    zero = [[0.0, 0.0], [0.0, 0.0]]
    assert abs(passivity_quadratic_form(zero, zero, [1.5, -2.5])) < 1e-12, "skew-symmetric form"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the screw axis with its minus sign, the 6D power, the "
          "notch flexure's stiffness and stress, the t^(5/2) scaling, and the two-pass RNEA "
          "torques with the passivity form" % checks)


_selfcheck()
