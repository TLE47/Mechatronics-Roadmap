"""Browser self-check for 04-embedded.T3.04a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert center_aligned_arr(170_000_000.0, 40_000.0) == 2125, "up-down counts twice"
    assert center_aligned_arr(160_000_000.0, 25_000.0) == 3200, "the exercise register"
    assert abs(pwm_frequency(170_000_000.0, 1700) - 50_000.0) < 1e-9, "the Gate test carrier"
    checks += 1

    assert abs(low_side_window_ns(0.88, 250.0, 40_000.0) - 2500.0) < 1e-9, "two dead times"
    assert abs(low_side_window_ns(0.90, 200.0, 40_000.0) - 2100.0) < 1e-9, "the Skip test window"
    checks += 1

    assert q31_encode(0.5) == 1073741824, "cos(pi/3) is exactly 2^30"
    assert angle_to_q31(math.pi / 3.0) == 715827883, "theta/pi, then 2^31"
    assert q31_encode(-0.50) == -1073741824, "the exercise word"
    assert q31_encode(1.0) == (1 << 31) - 1, "+1.0 clamps, it does not wrap"
    assert abs(q31_decode(1073741824) - 0.5) < 1e-15, "and decoding halves it back"
    checks += 1

    assert seqlock_valid(4, 4) is True, "a clean read"
    assert seqlock_valid(5, 5) is False, "an odd snapshot is mid-write"
    assert seqlock_valid(4, 6) is False, "the writer ran between s1 and s2"
    checks += 1

    assert abs(isr_cpu_percent(3.0, 25.0) - 12.0) < 1e-12, "3 us of 25 us is 12%"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the center-aligned ARR and its low-side window, the Q1.31 "
          "word with its clamp, the even/odd sequence check, and the fast ISR's share of the CPU"
          % checks)


_selfcheck()
