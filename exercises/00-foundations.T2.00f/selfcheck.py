"""Browser self-check for 00-foundations.T2.00f.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert nyquist_hz(4000.0) == 2000.0, "Nyquist"
    assert abs(alias_hz(3150.0, 4000.0) - 850.0) < 1e-12, "one fold"
    assert abs(alias_hz(2700.0, 2000.0) - 700.0) < 1e-12, "fold below fs"
    assert abs(alias_hz(3000.0, 4000.0) - 1000.0) < 1e-12, "mirror the second half"
    assert abs(alias_hz(100.0, 4000.0) - 100.0) < 1e-12, "below Nyquist is untouched"
    checks += 1

    landed = tustin_hz(2.0 * math.pi * 850.0, 4000.0)
    assert abs(landed - 749.4803) < 1e-3, "unwarped Tustin lands low"
    assert abs(850.0 - landed - 100.5197) < 1e-3, "the missed hertz"
    checks += 1

    wa = prewarp_omega(850.0, 4000.0)
    assert abs(wa - 6306.6915) < 1e-3, "pre-warped analog frequency"
    assert abs(tustin_hz(wa, 4000.0) - 850.0) < 1e-9, "round trip lands on target"
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

    sigma = covariance_propagate([[1.0, 0.1], [0.0, 1.0]], [[1.0, 0.0], [0.0, 4.0]],
                                 [[0.0, 0.0], [0.0, 0.0]])
    assert abs(sigma[0][0] - 1.04) < 1e-12, "variance grows by the cross term"
    assert abs(sigma[0][1] - 0.4) < 1e-12 and abs(sigma[1][0] - 0.4) < 1e-12, "symmetric"
    assert abs(sigma[1][1] - 4.0) < 1e-12, "the second variance is untouched"
    checks += 1

    assert covariance_propagate([[1.0, 0.0], [0.0, 1.0]], [[2.0, 0.5], [0.5, 3.0]],
                                [[0.25, 0.0], [0.0, 0.75]])[0][0] == 2.25, "Q is added"

    print("SELF-CHECK PASS: %d checks - Nyquist, folding and mirroring, warping, pre-warp round "
          "trip, biquad normalization, the null, DC gain, covariance sandwich" % checks)


_selfcheck()
