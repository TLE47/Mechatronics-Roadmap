"""Browser self-check for 02-mechanics.T2.02a.

This file is appended verbatim to the exercise entry the workbench loads, after the learner's code.
That is why it is stdlib-only and imports nothing but `math` and `mechalab_plant`: Pyodide has both,
and the runner writes the plant into its filesystem before the program runs.

It is a coarser check than `test_behavior.py` (no unittest, one PASS line), and deliberately so: the
browser grades by comparing stdout. The full suite is still the CI authority, and both read the same
functions.
"""

import math

import mechalab_plant as plant


def _selfcheck():
    checks = 0
    poses = [(0.0, math.pi / 2.0), (0.37, 1.15), (-1.10, 0.62), (0.0, 0.0), (2.4, -0.9)]

    for q1, q2 in poses:
        J = jacobian(q1, q2)
        h = 1e-6
        x1p, y1p = plant.fk(q1 + h, q2)
        x1m, y1m = plant.fk(q1 - h, q2)
        x2p, y2p = plant.fk(q1, q2 + h)
        x2m, y2m = plant.fk(q1, q2 - h)
        want = [[(x1p - x1m) / (2 * h), (x2p - x2m) / (2 * h)],
                [(y1p - y1m) / (2 * h), (y2p - y2m) / (2 * h)]]
        for r in range(2):
            for c in range(2):
                assert abs(J[r][c] - want[r][c]) < 1e-6, "jacobian at q=(%.3f, %.3f)" % (q1, q2)
        checks += 1

    long_arm = jacobian(0.4, 0.9, 0.30, 0.25)
    assert abs(long_arm[0][0] - jacobian(0.4, 0.9)[0][0]) > 0.15, "jacobian ignored l1/l2"
    checks += 1

    J = jacobian(0.37, 1.15)
    F = (3.0, -7.0)
    tau = joint_torques(J, F)
    assert abs(tau[0] - (J[0][0] * F[0] + J[1][0] * F[1])) < 1e-12, "tau is not J^T F"
    dq = (0.21, -0.13)
    tip_v = (J[0][0] * dq[0] + J[0][1] * dq[1], J[1][0] * dq[0] + J[1][1] * dq[1])
    assert abs(tau[0] * dq[0] + tau[1] * dq[1] - (F[0] * tip_v[0] + F[1] * tip_v[1])) < 1e-12, "virtual work"
    checks += 1

    for q1, q2 in ((0.0, 0.0), (0.0, math.pi / 2.0), (math.pi / 2.0, 0.0), (0.55, 1.2)):
        got = gravity_from_com_jacobians(q1, q2)
        want = plant.gravity_torque(q1, q2)
        assert abs(got[0] - want[0]) < 1e-12 and abs(got[1] - want[1]) < 1e-12, \
            "gravity differs from the plant at q=(%.3f, %.3f)" % (q1, q2)
    checks += 1

    assert tuple(singular_elbow_angles()) == (0.0, math.pi), "singular elbow angles"
    checks += 1

    for q1, q2 in ((0.0, math.pi / 2.0), (0.30, 0.60)):
        by_force = joint_torques(jacobian(q1, q2), (0.0, 0.05 * plant.G))
        by_energy = potential_gradient(q1, q2)
        assert abs(by_force[0] - by_energy[0]) < 1e-9, "dU/dq1 vs J^T F"
        assert abs(by_force[1] - by_energy[1]) < 1e-9, "dU/dq2 vs J^T F"
    checks += 1

    on = payload_run(0.20, True)
    off = payload_run(0.20, False)
    assert on["rms_mm"] < 0.914, "compensated payload run should match the capstone (%.3f mm)" % on["rms_mm"]
    assert off["rms_mm"] > 2.5 * on["rms_mm"], "uncompensated payload run should be much worse"
    checks += 1

    print("SELF-CHECK PASS: %d checks - jacobian, J^T, gravity, singular, energy, payload" % checks)


_selfcheck()
