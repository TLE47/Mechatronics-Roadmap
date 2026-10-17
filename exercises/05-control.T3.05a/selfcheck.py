"""Browser self-check for 05-control.T3.05a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(joseph_variance(4.0, 1.0, 1.0, 0.8) - 0.80) < 1e-12, "the worked posterior"
    assert abs(optimal_gain(4.0, 1.0, 1.0) - 0.8) < 1e-12, "K = P H / (H P H + R)"
    assert abs(joseph_variance(10.0, 1.0, 1.0, 1.2) - 1.84) < 1e-9, "the gate posterior"
    checks += 1

    # A gain of 1.5 puts the naive (1 - K H) P^- at -2.0; the Joseph form squares it and adds
    # K^2 R, so the same bad gain lands at 3.25 instead of a negative variance.
    naive = (1.0 - 1.5 * 1.0) * 4.0
    assert abs(naive + 2.0) < 1e-12, "the naive update goes negative at this gain"
    assert abs(joseph_variance(4.0, 1.0, 1.0, 1.5) - 3.25) < 1e-12, "a bad gain stays positive"
    assert joseph_variance(4.0, 1.0, 1.0, 1.5) > 0.0
    checks += 1

    assert abs(nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04]) - 1.0) < 1e-12
    assert abs(nees_diagonal([0.20], [0.01]) - 4.0) < 1e-12, "an overconfident filter flags itself"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the Joseph-form posterior and its bad-gain rescue, and the "
          "NEES that measures whether the covariance was honest" % checks)


_selfcheck()
