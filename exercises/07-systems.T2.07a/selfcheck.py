"""Browser self-check for 07-systems.T2.07a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    energy = regen_energy_j(0.04, 30.0, 0.75)
    assert abs(energy - 13.5) < 1e-9, "regenerative energy"
    assert abs(regen_energy_j(0.04, 30.0, 1.0) - 18.0) < 1e-9, "the efficiency matters"
    checks += 1

    surge = unclamped_bus_v(24.0, energy, 1000e-6)
    assert abs(surge - math.sqrt(27576.0)) < 1e-9, "166 V on a 24 V bus"
    assert abs(unclamped_bus_v(24.0, 0.0, 1e-3) - 24.0) < 1e-12, "no energy, nominal bus"
    checks += 1

    bound = brake_resistor_max_ohm(28.0, 180.0)
    assert abs(bound - 4.3556) < 1e-4, "the resistor bound"
    assert 4.0 <= bound < 4.5, "4 ohm inside, 4.5 ohm outside"
    assert abs(brake_peak_current_a(28.0, 4.0) - 7.0) < 1e-12, "peak chopper current"
    checks += 1

    assert rolling_counter_status(3, 4) == "OK", "a normal step"
    assert rolling_counter_status(15, 0) == "OK", "a rollover is normal"
    assert rolling_counter_status(7, 7) == "FAULT_FROZEN", "a stuck counter"
    assert rolling_counter_status(2, 4) == "WARN_DROPPED_1", "one dropped frame"
    assert rolling_counter_status(2, 5) == "WARN_DROPPED_2", "two dropped frames"
    assert rolling_counter_status(2, 6) == "FAULT_SEQ_JUMP", "three is past the budget"
    checks += 1

    assert abs(watchdog_timeout_s(3, 1e-3) - 3e-3) < 1e-15, "three frame periods"
    assert abs(hil_coverage(4, 5) - 0.8) < 1e-12, "four of five fault modes"
    checks += 1

    print("SELF-CHECK PASS: %d checks - regen energy, the unclamped bus, the chopper bound and its "
          "current, the rolling counter across all five outcomes, the watchdog and HIL coverage"
          % checks)


_selfcheck()
