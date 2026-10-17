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

    Ad, Bd = state_matrices(1.0, 100.0, 10.0, 0.01)
    assert abs(Ad[0][1] - 0.01) < 1e-12 and abs(Ad[1][0] + 1.0) < 1e-12, "Ad"
    assert abs(Ad[1][1] - 0.9) < 1e-12 and abs(Bd[1] - 0.01) < 1e-12, "Bd"
    checks += 1

    stepped = one_step(Ad, Bd, [0.10, 0.20], 0.0)
    assert abs(stepped[0] - 0.102) < 1e-12, "x uses the old velocity"
    assert abs(stepped[1] - 0.08) < 1e-12, "v computed from the OLD x"
    checks += 1

    final = simulate(Ad, Bd, [0.10, 0.0], 5.0, 500)
    assert abs(final[0] - 0.05) < 1e-3 and abs(final[1]) < 1e-4, "equilibrium is u/k = 0.05 m"
    checks += 1

    trace = encoder_trace_angle(counts, 1e-3)
    for index, value in enumerate(trace):
        assert abs(value - plant.counts_to_rad(counts[index])) < one_count + 1e-9, "angle round trip"
    checks += 1

    print("SELF-CHECK PASS: %d checks - encoder velocity, wrap, integral, matrices, step order, "
          "equilibrium, round trip" % checks)


_selfcheck()
