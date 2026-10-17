"""Browser self-check for 05-control.T3.05a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(joseph_variance(4.0, 1.0, 1.0, 0.8) - 0.80) < 1e-12, "the worked posterior"
    assert abs(joseph_variance(4.0, 1.0, 1.0, 1.5) - 3.25) < 1e-12, "a bad gain stays positive"
    assert abs(optimal_gain(4.0, 1.0, 1.0) - 0.8) < 1e-12, "K = P H / (H P H + R)"
    assert abs(joseph_variance(10.0, 1.0, 1.0, 1.2) - 1.84) < 1e-9, "the gate posterior"
    checks += 1

    assert abs(cbf_command(0.80, 0.04, 5.0) - 0.20) < 1e-12, "the worked brake"
    assert abs(cbf_command(1.20, 0.10, 8.0, -2.0, 2.0) - 0.80) < 1e-12, "the exercise brake"
    assert abs(cbf_command(-0.40, 0.05, 6.0) + 0.40) < 1e-15, "a retreat is not modified"
    checks += 1

    rotation = exp_so3([0.0, 0.0, 0.05])
    assert abs(rotation[0][0] - math.cos(0.05)) < 1e-15, "the worked rotation"
    assert abs(rotation[0][1] + math.sin(0.05)) < 1e-15
    assert abs(rotation[1][0] - math.sin(0.05)) < 1e-15
    moved = inject_rotation([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], [0.0, 0.0, 0.05])
    det = (moved[0][0] * (moved[1][1] * moved[2][2] - moved[1][2] * moved[2][1])
           - moved[0][1] * (moved[1][0] * moved[2][2] - moved[1][2] * moved[2][0])
           + moved[0][2] * (moved[1][0] * moved[2][1] - moved[1][1] * moved[2][0]))
    assert abs(det - 1.0) < 1e-12, "the injection stays in SO(3)"
    checks += 1

    assert abs(barrier_lower_bound(0.20, 2.0, 0.50) - 0.20 * math.exp(-1.0)) < 1e-15
    checks += 1

    assert abs(nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04]) - 1.0) < 1e-12
    checks += 1

    print("SELF-CHECK PASS: %d checks - the Joseph-form posterior and its bad-gain rescue, the "
          "CBF projection with a retreat it leaves alone, the SO(3) injection and its "
          "determinant, the exponential margin, and the NEES" % checks)


_selfcheck()
