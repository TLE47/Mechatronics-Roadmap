"""Browser self-check for 04-embedded.T1.04b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert elapsed_us(12, 65520, 16) == 28, "the unsigned 16-bit wrap"
    assert tick_due(3000, 2000, 1000), "a tick exactly on the deadline"
    assert not tick_due(2999, 2000, 1000)
    assert next_deadline_us(0xFFFFFFFF, 1000) == 999, "the grid survives the wrap"
    checks += 1

    assert abs(isr_utilization_pct(45.0, 1000.0) - 4.5) < 1e-9, "45 us in a 1000 us period"
    assert abs(max_isr_exec_us(25.0, 10_000.0) - 25.0) < 1e-12, "the 25 percent budget"
    assert abs(fault_latency_us(3, 20_000.0) - 150.0) < 1e-9, "three samples at 20 kHz"
    checks += 1

    assert fsm_step("RUN", 5.5, 5.0, 0.10, 0.4) == ("FAULT", 0.0), "overcurrent cuts the PWM"
    assert fsm_step("FAULT", 0.0, 5.0, 0.10, 0.4) == ("FAULT", 0.0), "the fault is a latch"
    checks += 1

    assert ticks_in(250_000, 1000) == 250, "0.25 s of 1 kHz control"

    print("SELF-CHECK PASS: %d checks - the rollover-safe timer on its 1 kHz grid, the ISR budget "
          "and debounce latency, the latched FAULT state and the tick count" % checks)


_selfcheck()
