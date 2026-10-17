"""Browser self-check for 04-embedded.T2.04b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    tasks = [("Ctrl", 120.0, 1000.0), ("CAN", 250.0, 2000.0), ("Diag", 800.0, 10000.0)]
    assert abs(cpu_utilization(tasks) - 0.325) < 1e-12, "sum C_i / T_i"
    assert abs(cpu_utilization([(200.0, 1000.0), (500.0, 2500.0)]) - 0.40) < 1e-12
    checks += 1

    assert abs(liu_layland_bound(3) - 0.7797631496846196) < 1e-12, "n (2^(1/n) - 1)"
    assert liu_layland_bound(3) > cpu_utilization(tasks), "0.325 fits 0.7798"
    checks += 1

    assert abs(response_time_us(100.0, 40.0, 600.0) - 140.0) < 1e-12, "the mutex inherits"
    assert abs(response_time_us(100.0, 40.0, 600.0, inheritance=False) - 740.0) < 1e-12
    checks += 1

    assert can_winner([0x105, 0x012, 0x04A]) == 0x012, "the lowest identifier wins"
    assert can_winner([0x7FF, 0x000]) == 0x000
    checks += 1

    assert encode_fixed(9.0, -18.0, 18.0, 12) == 3071, "2^bits - 1, not 2^bits"
    assert abs(decode_fixed(3071, -18.0, 18.0, 12) - 8.997802197802198) < 1e-12
    assert abs(quantization_step(-18.0, 18.0, 12) - 0.008791208791208791) < 1e-15
    checks += 1

    print("SELF-CHECK PASS: %d checks - the Rate-Monotonic utilisation sum and its Liu-Layland "
          "bound, the priority-inheritance response time against the unbounded inversion, the "
          "lowest-CAN-ID arbitration, and the 2^bits - 1 MIT pack with its step" % checks)


_selfcheck()
