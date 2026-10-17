"""Browser self-check for 00-foundations.T2.00b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only (`math` + the
plant), one PASS line, because the browser grades on stdout.
"""

import math

import mechalab_plant as plant


def _selfcheck():
    checks = 0
    force = [0.0, -20.0, 15.0]
    lever = [0.30, 0.40, 0.00]

    assert abs(axial_force(force, lever) + 16.0) < 1e-9, "worked projection"
    assert abs(axial_force(force, [3.0, 4.0, 0.0]) + 16.0) < 1e-9, "projection must not scale with lever length"
    checks += 1

    tau = moment(lever, force)
    for got, want in zip(tau, [6.0, -4.5, -6.0]):
        assert abs(got - want) < 1e-9, "worked moment"
    assert abs(dot3(tau, lever)) < 1e-12, "moment is orthogonal to the lever"
    back = cross3(force, lever)
    for got, want in zip(tau, back):
        assert abs(got + want) < 1e-12, "cross product is antisymmetric"
    checks += 1

    assert abs(det2([3.0, 1.5], [2.0, 4.0]) - 9.0) < 1e-12, "determinant"
    assert abs(det2([1.0, 2.0], [2.0, 4.0])) < 1e-12, "collinear basis is singular"
    checks += 1

    c1, c2 = coordinates_in_basis([5.0, 3.0], [2.0, 0.0], [1.0, 1.0])
    assert abs(c1 - 1.0) < 1e-12 and abs(c2 - 3.0) < 1e-12, "coordinates in a basis"
    rebuilt = in_basis([4.0, 2.5], [1.2, -0.4], [0.3, 1.7])
    for got, want in zip(rebuilt, [4.0, 2.5]):
        assert abs(got - want) < 1e-12, "round trip"
    checks += 1

    refused = False
    try:
        coordinates_in_basis([1.0, 1.0], [1.0, 2.0], [2.0, 4.0])
    except ValueError:
        refused = True
    assert refused, "a singular basis must raise ValueError, not return inf"
    checks += 1

    q = plant.ik(0.08, 0.05)
    x, y = plant.fk(*q)
    arm_tau = moment([x, y, 0.0], [0.0, -0.20 * plant.G, 0.0])
    assert abs(arm_tau[2] + 0.20 * plant.G * x) < 1e-12, "payload moment about the shoulder"
    checks += 1

    print("SELF-CHECK PASS: %d checks - projection, moment, determinant, basis, refusal, arm payload"
          % checks)


_selfcheck()
