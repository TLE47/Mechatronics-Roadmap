"""Browser self-check for 03-sensors.T3.03a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, fixed cost,
one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    # The worked example: -1500 * 120e-6 * 20 = -3.60 V, 1500 * 0.008 = 12.00 V.
    vd_ff, vq_ff = dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)
    assert abs(vd_ff + 3.60) < 1e-9, "d-axis cross-coupling"
    assert abs(vq_ff - 12.0) < 1e-9, "q-axis back-EMF"
    assert abs(dq_feedforward(2000.0, 120e-6, 150e-6, 0.0, 15.0, 0.008)[0] + 4.50) < 1e-9
    checks += 1

    # The exercise: v_0 = -6.0 V, duties (0.875, 0.125, 0.125) on a 48 V bus.
    assert abs(svpwm_offset(24.0, -12.0, -12.0) + 6.0) < 1e-12, "min-max offset"
    da, db, dc = svpwm_duties(24.0, -12.0, -12.0, 48.0)
    assert abs(da - 0.875) < 1e-12 and abs(db - 0.125) < 1e-12 and abs(dc - 0.125) < 1e-12
    assert abs((da - db) - (24.0 - (-12.0)) / 48.0) < 1e-12, "line-to-line preserved"
    checks += 1

    # 48 V / sqrt(3) = 27.7128 V against sine PWM's 24.0 V: +15.47%.
    assert abs(hexagon_limit(48.0) - 27.712812921102035) < 1e-9
    assert abs(hexagon_gain() - 1.1547005383792515) < 1e-12
    assert abs(100.0 * (hexagon_gain() - 1.0) - 15.470053837925155) < 1e-9
    assert hexagon_limit(48.0) > 24.0
    checks += 1

    # The worked example's 64-sample fit: a1 = 0.012 rad, b2 = -0.005 rad, amplitude 0.010 rad.
    angles = [2.0 * math.pi * k / 64 for k in range(64)]
    errors = [0.012 * math.cos(th) - 0.005 * math.sin(2.0 * th) for th in angles]
    a1, b1 = harmonic_coefficients(errors, 1)
    a2, b2 = harmonic_coefficients(errors, 2)
    assert abs(a1 - 0.012) < 1e-12 and abs(b1) < 1e-12, "first harmonic"
    assert abs(a2) < 1e-12 and abs(b2 + 0.005) < 1e-12, "second harmonic is orthogonal"
    assert abs(harmonic_amplitude(0.008, -0.006) - 0.010) < 1e-12, "quadrature amplitude"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the dq decoupling feedforward, the Min-Max zero-sequence "
          "offset with its duties, the hexagonal voltage limit and its gain, and the Fourier "
          "encoder fit with its amplitude" % checks)


_selfcheck()
