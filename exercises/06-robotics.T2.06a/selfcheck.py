"""Browser self-check for 06-robotics.T2.06a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    assert qos_compatible(True, True, True, True) is True, "a match connects"
    assert qos_compatible(True, False, False, False) is True, "reliable feeds best-effort"
    assert qos_compatible(False, False, True, False) is False, "best-effort cannot feed reliable"
    assert qos_compatible(True, False, True, True) is False, "volatile cannot feed transient local"
    checks += 1

    t = urdf_revolute_z((0.25, 0.0, 0.10), 0.0)
    assert t[0] == [1.0, 0.0, 0.0, 0.25], "a zero joint is a translation"
    assert t[3] == [0.0, 0.0, 0.0, 1.0], "homogeneous bottom row"
    checks += 1

    turn = urdf_revolute_z((0.0, 0.0, 0.0), math.pi / 2.0)
    out = transform_point(turn, [1.0, 0.0, 0.0])
    assert abs(out[0]) < 1e-12 and abs(out[1] - 1.0) < 1e-12, "a quarter turn about +Z"
    checks += 1

    t_b_l1 = urdf_revolute_z((0.0, 0.0, 0.10), 0.0)
    t_l1_tool = urdf_revolute_z((0.25, 0.0, 0.0), math.pi / 2.0)
    p = transform_point(mat4_mul(t_b_l1, t_l1_tool), [0.15, 0.0, 0.0])
    assert abs(p[0] - 0.25) < 1e-9 and abs(p[1] - 0.15) < 1e-9 and abs(p[2] - 0.10) < 1e-9
    checks += 1

    pose = mat4_mul(urdf_revolute_z((0.3, -0.2, 0.1), 0.9), urdf_revolute_z((0.1, 0.0, 0.0), -1.4))
    target = [0.05, -0.07, 0.02]
    back = transform_point(invert_rigid(pose), transform_point(pose, target))
    assert all(abs(back[i] - target[i]) < 1e-12 for i in range(3)), "the rigid inverse round-trips"
    checks += 1

    assert abs(interpolate(1.000, 0.20, 1.010, 0.25, 1.004) - 0.22) < 1e-9, "buffer interpolation"
    assert abs(interpolate(2.0, 7.0, 3.0, 9.0, 3.0) - 9.0) < 1e-12, "the end is the sample"
    try:
        interpolate(1.0, 0.0, 1.1, 1.0, 1.2)
    except ValueError:
        pass
    else:
        raise AssertionError("extrapolation must be refused")
    checks += 1

    assert abs(topic_bandwidth_mb_s(3, 1200, 30.0) - 0.108) < 1e-12, "unicast bandwidth"
    assert topic_bandwidth_mb_s(0, 5000, 100.0) == 0.0, "no subscribers, no traffic"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the QoS rule, a joint matrix, a quarter turn, the tf2 "
          "chain, the rigid inverse, the buffer interpolation and the bandwidth budget" % checks)


_selfcheck()
