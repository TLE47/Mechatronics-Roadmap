"""Browser self-check for 00-foundations.T1.00d.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(sensor_voltage(0.20, 5.0, 1.65) - 2.65) < 1e-12, "calibration line"
    assert abs(sensor_current(0.20, 1.70, 0.50) - 6.0) < 1e-9, "inverse line"
    checks += 1

    x, y = polar_to_cartesian(0.40, degrees_to_radians(135.0))
    assert abs(x + 0.282842712474619) < 1e-12, "cosine projection"
    assert abs(y - 0.282842712474619) < 1e-12, "sine projection"
    checks += 1

    assert abs(link_length(-0.30, -0.40) - 0.50) < 1e-12, "Euclidean norm"
    checks += 1

    assert abs(heading_deg(-0.30, -0.40) + 126.86989764584402) < 1e-9, "quadrant III heading"
    assert abs(heading_deg(0.0, 0.25) - 90.0) < 1e-12, "straight up"
    checks += 1

    assert abs(degrees_to_radians(180.0) - 3.141592653589793) < 1e-12, "half a turn is pi"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the calibration line and its inverse, the two unit-circle "
          "projections, the Euclidean norm, the four-quadrant heading and the radian conversion"
          % checks)


_selfcheck()
