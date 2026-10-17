"""Browser self-check for 06-robotics.T2.06b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    topics = [("/joint_states", 1000.0, 128), ("/imu/data", 200.0, 96),
              ("/camera/depth", 30.0, 150_000)]
    rate = disk_rate_mb_s(topics, meta_bytes=32, compression=0.40)
    assert abs(rate - 1.874624) < 1e-6, "zstd recording rate"
    assert abs(bag_size_mb(rate, 600.0) - 1124.7744) < 1e-3, "ten-minute bag"
    checks += 1

    bare = disk_rate_mb_s([("/j", 1000.0, 128)], meta_bytes=0)
    with_meta = disk_rate_mb_s([("/j", 1000.0, 128)], meta_bytes=32)
    assert abs(bare - 0.128) < 1e-12 and abs(with_meta - 0.160) < 1e-12, "32 bytes per message"
    checks += 1

    assert timer_steps(0.004, 0.001) == 4, "an exact multiple"
    assert timer_steps(0.0045, 0.001) == 5, "a ceiling"
    assert timer_steps(1e-5, 1e-3) == 1, "a timer faster than the clock"
    checks += 1

    assert abs(intra_process_saving_mb_s(5, 128, 1000.0) - 0.64) < 1e-12, "five subscribers"
    assert intra_process_saving_mb_s(0, 128, 1000.0) == 0.0, "nobody listening"
    checks += 1

    for rate in (0.25, 1.0, 4.0):
        assert abs(replay_derivative(10.000, 0.50, 10.002, 0.54) - 20.0) < 1e-9, "rate invariant"
        assert abs(wall_delay_s(10.000, 10.002, rate) - 0.002 / rate) < 1e-12, "wall sleep"
    checks += 1

    assert control_decimation(1000.0, 500.0) == 2, "the capstone's 500 Hz controller"
    assert control_decimation(1000.0, 100.0) == 10, "a 100 Hz controller"
    try:
        control_decimation(1000.0, 300.0)
    except ValueError:
        pass
    else:
        raise AssertionError("a non-integral decimation must be refused")
    checks += 1

    print("SELF-CHECK PASS: %d checks - the MCAP budget, the per-message metadata, the simulated "
          "clock's ceiling, composable savings, rate-invariant replay and the decimation"
          % checks)


_selfcheck()
