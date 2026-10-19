"""Browser self-check for 00-foundations.T2.00i.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    landed = tustin_hz(2.0 * math.pi * 850.0, 4000.0)
    assert abs(landed - 749.4803) < 1e-3, "unwarped Tustin lands low"
    assert abs(850.0 - landed - 100.5197) < 1e-3, "the missed hertz"
    checks += 1

    wa = prewarp_omega(850.0, 4000.0)
    assert abs(wa - 6306.6915) < 1e-2, "pre-warped analog frequency"
    assert abs(tustin_hz(wa, 4000.0) - 850.0) < 1e-9, "round trip lands on target"
    checks += 1

    assert abs(prewarp_omega(600.0, 2000.0) - 5505.5277) < 1e-3, "the exercise's own target"
    checks += 1

    b0, b1, b2, a1, a2 = notch_coeffs(850.0, 4000.0, 5.0)
    alpha = math.sin(2.0 * math.pi * 850.0 / 4000.0) / 10.0
    assert abs(b0 - 1.0 / (1.0 + alpha)) < 1e-12, "normalized b0"
    assert abs(b2 - b0) < 1e-15 and abs(a1 - b1) < 1e-15, "notch symmetry"
    dc = (b0 + b1 + b2) / (1.0 + a1 + a2)
    assert abs(dc - 1.0) < 1e-12, "unity DC gain"
    checks += 1

    step = apply_biquad((b0, b1, b2, a1, a2), [1.0] * 1000)
    assert len(step) == 1000 and abs(step[-1] - 1.0) < 1e-9, "a step passes the notch at DC"
    tone = [math.sin(2.0 * math.pi * 850.0 * k / 4000.0) for k in range(4000)]
    out = apply_biquad((b0, b1, b2, a1, a2), tone)
    energy_in = sum(v * v for v in tone[2000:])
    energy_out = sum(v * v for v in out[2000:])
    assert energy_out < 1e-6 * energy_in, "a true null at 850 Hz"
    checks += 1

    for bad in (0.0, -1.0):
        try:
            notch_coeffs(850.0, 4000.0, bad)
        except ValueError:
            pass
        else:
            raise AssertionError("a non-positive quality factor must be refused")
    try:
        apply_biquad((1.0, 0.0), [1.0])
    except ValueError:
        pass
    else:
        raise AssertionError("a two-coefficient biquad must be refused")
    checks += 1

    print("SELF-CHECK PASS: %d checks - warping, pre-warp round trip, normalization, the null, "
          "DC gain, and the refusals" % checks)


_selfcheck()
