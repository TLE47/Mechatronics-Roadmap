"""Browser self-check for 03-sensors.T1.03a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, constant time,
one PASS line.
"""

import math

TAU = 2.0 * math.pi


def _selfcheck():
    checks = 0

    assert abs(back_emf(0.05, 100.0) - 5.0) < 1e-12, "Ke times omega"
    assert abs(winding_current(12.0, 100.0, 0.05, 2.0) - 3.5) < 1e-12, "the EMF is subtracted"
    assert abs(winding_current(12.0, 200.0, 0.06, 4.0)) < 1e-12, "no-load draws nothing"
    assert abs(motor_torque(0.05, 3.5) - 0.175) < 1e-12, "Kt times i"
    checks += 1

    assert pole_pairs(14) == 7, "14 magnets are 7 pole pairs"
    assert pole_pairs(28) == 14
    assert abs(electrical_angle(math.pi / 7.0, 7) - math.pi) < 1e-12, "one cycle per seventh"
    assert abs(electrical_angle(1.0, 7) - 0.7168146928204138) < 1e-12, "wrapped into one cycle"
    checks += 1

    assert quadrature_cpr(1024) == 4096, "four edges per line"
    assert quadrature_cpr(500) == 2000
    radians, degrees = angle_resolution(4096)
    assert abs(degrees - 0.087890625) < 1e-12, "360 over CPR"
    assert abs(radians - TAU / 4096.0) < 1e-18
    checks += 1

    forward = [0b00, 0b10, 0b11, 0b01, 0b00, 0b10]
    assert sum(quad_step(a, b) for a, b in zip(forward, forward[1:])) == 5, "Gray-code forward"
    backward = list(reversed(forward))
    assert sum(quad_step(a, b) for a, b in zip(backward, backward[1:])) == -5
    assert quad_step(0b00, 0b11) == 0, "two bits at once is not a step"
    checks += 1

    print("SELF-CHECK PASS: %d checks - back-EMF and the current it leaves, pole pairs and the "
          "wrapped electrical angle, 4x quadrature counts with their resolution, and the Gray-code "
          "step that refuses a two-bit jump" % checks)


_selfcheck()
