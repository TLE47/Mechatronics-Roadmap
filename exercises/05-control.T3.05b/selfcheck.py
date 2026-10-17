"""Browser self-check for 05-control.T3.05b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    rotation = exp_so3([0.0, 0.0, 0.05])
    assert abs(rotation[0][0] - math.cos(0.05)) < 1e-15, "the worked rotation"
    assert abs(rotation[0][1] + math.sin(0.05)) < 1e-15
    assert abs(rotation[1][0] - math.sin(0.05)) < 1e-15
    assert abs(rotation[2][2] - 1.0) < 1e-15
    checks += 1

    moved = inject_rotation([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], [0.0, 0.0, 0.05])
    det = (moved[0][0] * (moved[1][1] * moved[2][2] - moved[1][2] * moved[2][1])
           - moved[0][1] * (moved[1][0] * moved[2][2] - moved[1][2] * moved[2][0])
           + moved[0][2] * (moved[1][0] * moved[2][1] - moved[1][1] * moved[2][0]))
    assert abs(det - 1.0) < 1e-12, "the injection stays in SO(3)"
    checks += 1

    still = inject_rotation([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]], [0.0, 0.0, 0.0])
    assert abs(still[0][0]) < 1e-15 and abs(still[0][1] + 1.0) < 1e-15, "zero correction is a no-op"
    checks += 1

    held = eskf_rotation_update([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                                [0.0, 0.0, 0.05], [0.0, 0.0, 0.0])
    assert abs(held[1][0] - math.sin(0.05)) < 1e-15, "the reset holds the consumed correction"
    assert abs(held[1][0] - math.sin(0.10)) > 1e-6, "a stale mean would read 0.10 rad here"
    checks += 1

    stepped = eskf_rotation_update([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                                   [0.0, 0.0, 0.05], [0.0, 0.0, 0.02])
    assert abs(stepped[1][0] - math.sin(0.07)) < 1e-15, "the next innovation still lands"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the Rodrigues exponential, its SO(3) injection, the "
          "zero-correction no-op, the reset that holds 0.05 rad, and the 0.07 rad second step"
          % checks)


_selfcheck()
