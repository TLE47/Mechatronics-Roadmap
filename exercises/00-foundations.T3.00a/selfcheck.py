"""Browser self-check for 00-foundations.T3.00a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    w = [1.5, -2.0, 3.0]
    v = [0.4, 0.8, -0.5]
    moved = mat3_vec(hat(w), v)
    cross = [w[1] * v[2] - w[2] * v[1], w[2] * v[0] - w[0] * v[2], w[0] * v[1] - w[1] * v[0]]
    for i in range(3):
        assert abs(moved[i] - cross[i]) < 1e-12, "[w]_x v must be w x v"
    assert abs(sum(v[i] * moved[i] for i in range(3))) < 1e-15, "a cross product does no work"
    checks += 1

    back = vee(hat(w))
    assert all(abs(back[i] - w[i]) < 1e-15 for i in range(3)), "vee inverts hat"
    checks += 1

    u = [1.0 / math.sqrt(3.0), -1.0 / math.sqrt(3.0), 1.0 / math.sqrt(3.0)]
    k = hat(u)
    k2 = mat3_mul(k, k)
    k3 = mat3_mul(k2, k)
    worst = max(abs(k3[i][j] + k[i][j]) for i in range(3) for j in range(3))
    assert worst < 1e-15, "for a unit axis [u]_x^3 = -[u]_x"
    checks += 1

    r = exp_so3([0.0, 0.0, math.pi / 2.0])
    out = mat3_vec(r, [1.0, 0.0, 0.0])
    assert abs(out[0]) < 1e-12 and abs(out[1] - 1.0) < 1e-12, "a quarter turn about z sends x to y"
    checks += 1

    tiny = exp_so3([1e-9, -1e-9, 1e-9])
    det = (tiny[0][0] * (tiny[1][1] * tiny[2][2] - tiny[1][2] * tiny[2][1])
           - tiny[0][1] * (tiny[1][0] * tiny[2][2] - tiny[1][2] * tiny[2][0])
           + tiny[0][2] * (tiny[1][0] * tiny[2][1] - tiny[1][1] * tiny[2][0]))
    assert abs(det - 1.0) < 1e-14, "a nanoradian rotation is still a rotation"
    rtr = mat3_mul([[tiny[j][i] for j in range(3)] for i in range(3)], tiny)
    for i in range(3):
        for j in range(3):
            assert abs(rtr[i][j] - (1.0 if i == j else 0.0)) < 1e-14, "R^T R = I at 1e-9 rad"
    checks += 1

    turn = exp_so3([0.0, 0.0, 2.0 * math.pi])
    same = mat3_vec(turn, [0.5, -0.25, 0.0])
    assert abs(same[0] - 0.5) < 1e-12 and abs(same[1] + 0.25) < 1e-12, "a full turn is the identity"
    checks += 1

    assert abs(energy_rate([1.0, 2.0, 3.0], [4.0, 5.0, 6.0]) - 32.0) < 1e-12, "dH/dt = grad . x_dot"
    assert abs(energy_rate([1.0, 2.0, 3.0], [4.0, 5.0, 6.0], 2.0) - 30.0) < 1e-12, "dissipation"
    checks += 1

    print("SELF-CHECK PASS: %d checks - hat equals cross, vee inverse, the cubic identity, a quarter "
          "turn, the nanoradian rotation, the full turn, and the power balance" % checks)


_selfcheck()
