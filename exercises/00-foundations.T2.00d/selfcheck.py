"""Browser self-check for 00-foundations.T2.00d.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    mag, phase = to_polar(3.0 + 4.0j)
    assert abs(mag - 5.0) < 1e-12, "magnitude is the hypotenuse"
    assert abs(phase - math.atan2(4.0, 3.0)) < 1e-12, "phase of the first quadrant"
    checks += 1

    for real, imag, expected in ((1, 1, 45.0), (-1, 1, 135.0), (-1, -1, -135.0), (1, -1, -45.0)):
        _m, got = to_polar(complex(real, imag))
        assert abs(math.degrees(got) - expected) < 1e-9, "all four quadrants: %s" % ((real, imag),)
    checks += 1

    z = to_rect(2.0, math.pi / 3.0)
    assert abs(z.real - 1.0) < 1e-12 and abs(z.imag - math.sqrt(3.0)) < 1e-12, "Euler's formula"
    assert abs(to_rect(1.0, math.pi).real + 1.0) < 1e-12, "e^{j pi} = -1"
    checks += 1

    total = add_phasors(to_rect(1.0, 0.0), to_rect(1.0, math.pi))
    assert abs(total) < 1e-12, "opposite phasors cancel"
    _m, _p = to_polar(add_phasors(to_rect(1.0, 0.0), to_rect(1.0, math.pi / 3.0)))
    assert abs(_m - math.sqrt(3.0)) < 1e-12 and abs(_p - math.pi / 6.0) < 1e-12, "two at 60 degrees"
    checks += 1

    print("SELF-CHECK PASS: %d checks - hypotenuse, four quadrants, Euler's formula, phasor sums"
          % checks)


_selfcheck()
