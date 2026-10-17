"""Browser self-check for 05-control.T3.05c.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(cbf_command(0.80, 0.04, 5.0) - 0.20) < 1e-12, "the worked brake"
    assert abs(cbf_command(1.20, 0.10, 8.0, -2.0, 2.0) - 0.80) < 1e-12, "the exercise brake"
    assert abs(cbf_command(0.80, 0.05, 6.0) - 0.30) < 1e-12, "the skip-test brake"
    assert abs(cbf_command(-0.40, 0.05, 6.0) + 0.40) < 1e-15, "a retreat is not modified"
    checks += 1

    assert abs(barrier_lower_bound(0.20, 2.0, 0.50) - 0.20 * math.exp(-1.0)) < 1e-15
    assert abs(barrier_lower_bound(0.20, 2.0, 0.0) - 0.20) < 1e-15
    checks += 1

    print("SELF-CHECK PASS: %d checks - the CBF projection at the worked, exercise and skip-test "
          "margins, a retreat it leaves alone, and the exponential margin at two times" % checks)


_selfcheck()
