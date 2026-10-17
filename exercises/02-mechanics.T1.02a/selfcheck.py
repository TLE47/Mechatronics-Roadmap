"""Browser self-check for 02-mechanics.T1.02a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert abs(gravity_torque(0.0, 0.40, 0.10, 0.50, 0.20) - 1.3734) < 1e-9, "horizontal lever"
    assert abs(gravity_torque(math.pi / 3.0, 0.40, 0.10, 0.50, 0.20) - 0.6867) < 1e-9
    assert abs(gravity_torque(math.pi / 2.0, 1.0, 0.30)) < 1e-9, "overhead has no lever arm"
    assert gravity_torque(0.0, 0.8, 0.25) > gravity_torque(math.pi / 4.0, 0.8, 0.25)
    checks += 1

    assert abs(balance_force(30.0, 0.20, 0.10) - 60.0) < 1e-12, "static equilibrium"
    assert abs(balance_force(30.0, 0.20, 0.40) - 15.0) < 1e-12
    checks += 1

    assert abs(gear_ratio(72, 16) - 4.5) < 1e-12, "driven over driver"
    assert abs(gear_output_speed(90.0, 4.5) - 20.0) < 1e-12, "a reducer slows the output"
    assert abs(gear_output_torque(0.40, 4.5, 0.95) - 1.71) < 1e-12, "and multiplies the torque"
    checks += 1

    out_torque = gear_output_torque(0.40, 4.5, 0.95)
    out_speed = gear_output_speed(90.0, 4.5)
    assert abs(mechanical_power(out_torque, out_speed) - 0.95 * mechanical_power(0.40, 90.0)) < 1e-9
    assert abs(reflected_inertia(1e-5, 4.5) - 2.025e-4) < 1e-15, "the ratio is squared"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the lever-arm gravity torque, the balancing force, the gear "
          "ratio with its speed and torque, power conservation and reflected inertia" % checks)


_selfcheck()
