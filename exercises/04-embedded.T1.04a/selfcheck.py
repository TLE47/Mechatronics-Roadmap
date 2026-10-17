"""Browser self-check for 04-embedded.T1.04a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert int_range(16, True) == (-32768, 32767), "2**(bits-1) - 1 at the top"
    assert int_range(8) == (0, 255), "unsigned starts at zero"
    checks += 1

    assert wrap_uint(65536, 16) == 0, "the odometer rolls over"
    assert wrap_uint(-1, 16) == 65535
    assert elapsed_unsigned(4, 65530, 16) == 10, "the mask is what makes the difference work"
    assert elapsed_unsigned(3, 250, 8) == 9
    checks += 1

    assert apply_bits(0x5A, 1 << 6, 1 << 3) == 0x52, "set 6, clear 3, neighbours kept"
    assert apply_bits(0x0F, 0, 1 << 2) == 11
    assert bit_is_set(0x52, 6) == 1 and bit_is_set(0x52, 3) == 0
    checks += 1

    frame = pack_telemetry(1000, -512, 3.25)
    assert len(frame) == 8, "2 + 2 + 4 bytes"
    assert frame == b"\xe8\x03\x00\xfe\x00\x00\x50\x40", "little-endian <Hhf"
    assert unpack_telemetry(frame) == (1000, -512, 3.25)
    checks += 1

    print("SELF-CHECK PASS: %d checks - the fixed-width ranges, the rollover-safe tick "
          "difference, the register edit that keeps its neighbours, and the 8-byte little-endian "
          "telemetry frame packed and read back" % checks)


_selfcheck()
