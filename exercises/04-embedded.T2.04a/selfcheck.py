"""Browser self-check for 04-embedded.T2.04a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(spi_shift_us(24, 12e6) - 2.0) < 1e-12, "bits over clocks"
    assert abs(spi_frame_us(16, 10e6) - 2.0) < 1e-12, "chip-select is part of the frame"
    assert abs(spi_frame_us(16, 10e6, 0.0) - 1.6) < 1e-12, "no overhead, no overhead"
    checks += 1

    assert abs(uart_poll_us(320, 1e6) - 320.0) < 1e-9, "every bit stalls the loop"
    assert abs(cpu_load_fraction(322.0, 50.0) - 6.44) < 1e-12, "over budget"
    assert abs(cpu_load_fraction(0.5, 50.0) - 0.01) < 1e-12
    checks += 1

    assert abs(ping_pong_window_us(16, 200000) - 80.0) < 1e-9, "half, not the 2N total"
    assert abs(ht_frequency_hz(64000, 32) - 2000.0) < 1e-9
    checks += 1

    assert buffer_slice_for_position(3, 4) == (0, 4), "HT reads Ping"
    assert buffer_slice_for_position(7, 4) == (4, 8), "TC reads Pong"
    assert buffer_slice_for_position(2, 4) is None, "mid-half is not safe"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the SPI shift and frame time, the polled CPU load, the "
          "ping-pong window and HT rate, and which half each interrupt may read" % checks)


_selfcheck()
