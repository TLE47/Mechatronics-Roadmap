"""Browser self-check for 01-electronics.T1.01a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(stall_current(12.0, 3.0) - 4.0) < 1e-12, "Ohm's law at stall"
    assert abs(stall_current(12.0, 2.4) - 5.0) < 1e-12
    checks += 1

    unloaded = divider_unloaded(24.0, 68_000.0, 10_000.0)
    loaded = divider_loaded(24.0, 68_000.0, 10_000.0, 100_000.0)
    assert abs(unloaded - 3.076923) < 1e-6 and unloaded < 3.3, "the sensing divider"
    assert abs(loaded - 2.830189) < 1e-6 and loaded < unloaded, "the ADC loads the bottom leg"
    assert divider_unloaded(24.0, 10_000.0, 68_000.0) > 20.0, "the swapped legs destroy the pin"
    checks += 1

    assert abs(joule_power(5.0, 2.4) - 60.0) < 1e-12, "P = I^2 R on a stalled winding"
    assert abs(joule_power(10.0, 0.050) - 5.0) < 1e-12
    checks += 1

    r = led_series_resistor(5.0, 2.1, 0.010)
    assert abs(r - 290.0) < 1e-9, "KVL first, then divide"
    assert abs(led_current(5.0, 2.1, r) - 0.010) < 1e-12
    assert abs(joule_power(0.010, r) - 0.029) < 1e-9, "and the resistor's own heat"
    checks += 1

    assert within_derating(0.125, 0.25) and not within_derating(0.2, 0.25), "half the rating"
    checks += 1

    print("SELF-CHECK PASS: %d checks - Ohm's law, the loaded divider, Joule heating, the LED's "
          "series resistor and the half-rating rule" % checks)


_selfcheck()
