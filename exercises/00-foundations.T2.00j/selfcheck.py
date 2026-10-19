"""Browser self-check for 00-foundations.T2.00j.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    sigma = covariance_propagate([[1.0, 0.1], [0.0, 1.0]], [[1.0, 0.0], [0.0, 4.0]],
                                 [[0.0, 0.0], [0.0, 0.0]])
    assert abs(sigma[0][0] - 1.04) < 1e-12, "variance grows by the cross term"
    assert abs(sigma[0][1] - 0.4) < 1e-12 and abs(sigma[1][0] - 0.4) < 1e-12, "symmetric"
    assert abs(sigma[1][1] - 4.0) < 1e-12, "the second variance is untouched"
    checks += 1

    assert covariance_propagate([[1.0, 0.0], [0.0, 1.0]], [[2.0, 0.5], [0.5, 3.0]],
                                [[0.25, 0.0], [0.0, 0.75]])[0][0] == 2.25, "Q is added"
    checks += 1

    sy = covariance_propagate([[1.0, 0.1], [0.0, 1.0]], [[0.01, 0.0], [0.0, 0.25]],
                              [[0.001, 0.0], [0.0, 0.002]])
    assert abs(sy[0][0] - 0.0135) < 1e-12, "the module's own example"
    assert abs(sy[1][1] - 0.252) < 1e-12, "the second diagonal"
    checks += 1

    assert symmetrize([[1.0, 2.0], [4.0, 3.0]]) == [[1.0, 3.0], [3.0, 3.0]], "average both sides"
    checks += 1

    try:
        covariance_propagate([[1.0, 0.0, 0.0]], [[1.0, 0.0], [0.0, 1.0]],
                             [[0.0, 0.0], [0.0, 0.0]])
    except ValueError:
        pass
    else:
        raise AssertionError("a 1x3 matrix must be refused")
    try:
        symmetrize([[1.0, 2.0], [3.0]])
    except ValueError:
        pass
    else:
        raise AssertionError("a ragged matrix must be refused")
    checks += 1

    print("SELF-CHECK PASS: %d checks - the sandwich rule, Q added, symmetry, the module example, "
          "and the refusals" % checks)


_selfcheck()
