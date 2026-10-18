"""Browser self-check for 00-foundations.T2.00a.

Appended verbatim to the workbench entry, after the learner's code, so it must be stdlib-only
(`math` + `mechalab_plant`). Coarser than `test_behavior.py`: one PASS line, because the browser
grades on stdout. The full suite in CI is the authority.
"""

import math

import mechalab_plant as plant


def _selfcheck():
    checks = 0
    one_count = 2.0 * math.pi / plant.ENCODER_CPR

    counts = list(range(6))                       # exactly one count per 1 ms sample
    expected = one_count / 1e-3
    velocity = joint_velocity(counts, 1e-3)
    assert velocity[0] == 0.0, "first velocity has no previous sample"
    for value in velocity[1:]:
        assert abs(value - expected) < 1e-6, "one count per sample: %.4f rad/s" % value
    slow = joint_velocity(counts, 1e-2)
    assert abs(slow[1] * 10.0 - velocity[1]) < 1e-6, "velocity does not divide by dt"
    checks += 1

    wrapped = joint_velocity([4094, 4095, 0, 1], 1e-3)
    for value in wrapped[1:]:
        assert abs(value - 2.0 * math.pi / 4096 / 1e-3) < 1e-6, "wrap across the encoder zero"
    checks += 1

    integral = running_integral([1.0, 2.0, 3.0], 0.1)
    assert abs(integral[0] - 0.1) < 1e-12 and abs(integral[-1] - 0.6) < 1e-12, "running integral"
    checks += 1

    trace = encoder_trace_angle(counts, 1e-3)
    for index, value in enumerate(trace):
        assert abs(value - plant.counts_to_rad(counts[index])) < one_count + 1e-9, "angle round trip"
    checks += 1

    print("SELF-CHECK PASS: %d checks - encoder velocity, wrap, running integral, angle round trip"
          % checks)


_selfcheck()
