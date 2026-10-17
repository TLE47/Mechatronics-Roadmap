"""Browser self-check for 04-embedded.T2.04d.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    wire = wire_time_us(32, 14, 10, 921600.0)
    assert abs(wire - 499.1319) < 1e-4, "the 8N1 exercise"
    assert abs(wire_time_us(48, 16, 8, 5_000_000.0) - 102.4) < 1e-9, "CAN-FD, 64 bytes"
    assert abs(wire_time_us(24, 16, 8, 5_000_000.0) - 64.0) < 1e-9, "CAN-FD, 40 bytes"
    checks += 1

    link = link_utilization([(500.0, 48, 16), (500.0, 24, 16)], 8, 5_000_000.0)
    assert abs(link - 0.0832) < 1e-9, "8.32% of a 5 Mbps bus"
    assert link_utilization([(3000.0, 32, 14)], 10, 921600.0) > 1.0, "a saturated link"
    checks += 1

    assert handle_total(1, 2, 1, 0) == 4, "static handle count"
    assert abs(spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0]) - 185.0) < 1e-12, "spin WCET"
    assert spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0]) < 2000.0, "inside a 500 Hz thread"
    checks += 1

    rtt = ntp_rtt_us(1000.0, 500120.0, 500150.0, 1270.0)
    offset = ntp_offset_us(1000.0, 500120.0, 500150.0, 1270.0)
    assert abs(rtt - 240.0) < 1e-9, "round trip"
    assert abs(offset - 499000.0) < 1e-9, "clock offset"
    assert abs(ntp_offset_us(200.0, 10300.0, 10340.0, 440.0) - 10000.0) < 1e-9, "the module exercise"
    checks += 1

    true_offset, delay, process = 1234.5, 60.0, 15.0
    t1 = 10.0
    t2 = t1 + delay + true_offset
    t3 = t2 + process
    t4 = t3 + delay - true_offset
    assert abs(ntp_offset_us(t1, t2, t3, t4) - true_offset) < 1e-9, "symmetric links are exact"
    assert abs(ntp_rtt_us(t1, t2, t3, t4) - 2.0 * delay) < 1e-9, "rtt without host processing"
    # True offset 1000 us, forward delay 100 us, reverse delay 170 us: the midpoint reads 965.
    assert abs(ntp_offset_us(0.0, 1100.0, 1110.0, 280.0) - 965.0) < 1e-9, "asymmetric bias"
    checks += 1

    util = rtos_utilization([(100.0, 500.0), (300.0, 2000.0), (1000.0, 10000.0)])
    assert abs(util - 0.45) < 1e-12, "45% of the CPU"
    assert rtos_utilization([(600.0, 1000.0), (600.0, 1000.0)]) > 1.0, "an overloaded set"
    checks += 1

    print("SELF-CHECK PASS: %d checks - UART and CAN-FD wire time, the utilisation budget, the "
          "handle count, the spin WCET, the NTP offset and round trip, and the RTOS load" % checks)


_selfcheck()
