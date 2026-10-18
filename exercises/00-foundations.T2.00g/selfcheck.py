"""Browser self-check for 00-foundations.T2.00g.

Appended verbatim to the workbench entry, after the learner's code, so it must be stdlib-only
(`math` + `mechalab_plant`). Coarser than `test_behavior.py`: one PASS line, because the browser
grades on stdout. The full suite in CI is the authority.
"""

import math

import mechalab_plant as plant


def _selfcheck():
    checks = 0

    assert mat_vec([[2.0, -1.0], [0.5, 3.0]], [4.0, 2.0]) == [6.0, 8.0]
    checks += 1

    try:
        mat_vec([[1.0, 2.0]], [1.0, 2.0, 3.0])
    except ValueError:
        checks += 1
    else:
        raise AssertionError("a column of the wrong length must be refused")

    Ad, Bd = state_matrices(1.0, 100.0, 10.0, 0.01)
    assert abs(Ad[0][1] - 0.01) < 1e-12 and abs(Ad[1][0] + 1.0) < 1e-12, "Ad"
    assert abs(Ad[1][1] - 0.9) < 1e-12 and abs(Bd[1] - 0.01) < 1e-12, "Bd"
    checks += 1

    stepped = one_step(Ad, Bd, [0.10, 0.20], 0.0)
    assert abs(stepped[0] - 0.102) < 1e-12, "x uses the OLD velocity"
    assert abs(stepped[1] - 0.08) < 1e-12, "v computed from the OLD x"
    checks += 1

    final = simulate(Ad, Bd, [0.10, 0.0], 5.0, 500)
    assert abs(final[0] - 0.05) < 1e-3 and abs(final[1]) < 1e-4, "equilibrium is u/k = 0.05 m"
    checks += 1

    trace = position_trace(Ad, Bd, [0.10, 0.0], 5.0, 3)
    assert len(trace) == 4 and abs(trace[0] - 0.10) < 1e-12 and abs(trace[1] - 0.10) < 1e-12
    checks += 1

    A4, B4 = two_mass_matrices(1.0, 2.0, 50.0, 3.0, 0.001)
    assert len(A4) == 4 and len(A4[0]) == 4 and len(B4) == 4, "4x4 drivetrain"
    assert abs(B4[0]) < 1e-15 and abs(B4[1] - 0.001) < 1e-15, "the force enters only v1"
    moved = simulate(A4, B4, [0.0, 0.0, 0.0, 0.0], 1.0, 2000)
    assert moved[2] > 1e-3, "the coupled load must move"
    checks += 1

    print("SELF-CHECK PASS: %d checks - row dot products, shape refusal, matrices, step order, "
          "equilibrium, trace, 4-state drivetrain" % checks)


_selfcheck()
