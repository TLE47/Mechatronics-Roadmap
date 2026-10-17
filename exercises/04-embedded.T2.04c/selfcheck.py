"""Browser self-check for 04-embedded.T2.04c.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert align_stack(1020) == 1024, "round up, never down"
    assert align_stack(2048) == 2048
    assert align_stack(1) == 8
    checks += 1

    assert static_ram_bytes([2048, 1536, 1020], 128, [(16, 72)]) == 6144, "6.0 KiB, no heap"
    assert static_ram_bytes([2048, 1024], 128, [(8, 64)]) == 3840
    checks += 1

    node = {"status": "okay", "kconfig": "CONFIG_CAN"}
    assert device_dt_ready(node, {"CONFIG_CAN": True}) is True
    assert device_dt_ready(node, {}) is False, "the driver must be compiled in too"
    assert binding_problems({"fdcan1": node, "spi1": {"status": "okay", "kconfig": "CONFIG_SPI"}},
                            {"CONFIG_CAN": True}) == ["spi1"]
    checks += 1

    assert outranks(2, 6) is True, "smaller number wins"
    assert outranks(6, 2) is False
    assert outranks(3, 3) is False
    checks += 1

    assert effective_priority(6, 2) == 2, "min(6, 2), not max"
    assert effective_priority(7, 1) == 1
    checks += 1

    assert worst_case_response_us(110.0, 35.0) == 145.0, "k_mutex: no inversion"
    assert worst_case_response_us(110.0, 35.0, 300.0) == 445.0, "k_sem: 300 us of inversion"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the stack alignment, the 6144 B static image, the "
          "devicetree-and-Kconfig readiness contract, Zephyr's smaller-number priority order, the "
          "min() inheritance elevation and both response bounds" % checks)


_selfcheck()
