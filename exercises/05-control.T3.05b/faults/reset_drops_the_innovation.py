"""Planted fault: the update returns straight after the reset, so the next innovation is dropped.

The reset is correct here and the double-count is gone, which is exactly why this fault is worth
testing: the filter looks safe, but every measurement after the first is silently discarded, so a
0.05 rad correction followed by a real 0.02 rad innovation stays at 0.05 instead of 0.07.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math


def _vector(value, length, name):
    if not isinstance(value, (list, tuple)) or len(value) != length:
        raise ValueError("%s must be a %d-vector" % (name, length))
    return [float(item) for item in value]


def _matrix(value):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError("a rotation is a 3x3 matrix")
    rows = []
    for row in value:
        if not isinstance(row, (list, tuple)) or len(row) != 3:
            raise ValueError("a rotation is a 3x3 matrix")
        rows.append([float(item) for item in row])
    return rows


def exp_so3(rotvec):
    w = _vector(rotvec, 3, "rotvec")
    theta = math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
    skew = [
        [0.0, -w[2], w[1]],
        [w[2], 0.0, -w[0]],
        [-w[1], w[0], 0.0],
    ]
    square = [
        [sum(skew[i][m] * skew[m][j] for m in range(3)) for j in range(3)]
        for i in range(3)
    ]
    if theta < 1e-8:
        first, second = 1.0, 0.5
    else:
        first = math.sin(theta) / theta
        second = 2.0 * math.sin(0.5 * theta) ** 2 / (theta * theta)
    return [
        [(1.0 if i == j else 0.0) + first * skew[i][j] + second * square[i][j]
         for j in range(3)]
        for i in range(3)
    ]


def inject_rotation(r_nominal, d_theta):
    r = _matrix(r_nominal)
    step = exp_so3(d_theta)
    return [
        [sum(r[i][m] * step[m][j] for m in range(3)) for j in range(3)]
        for i in range(3)
    ]


def eskf_rotation_update(r_nominal, d_theta, innovation):
    r_plus = inject_rotation(r_nominal, d_theta)
    error_mean = [0.0, 0.0, 0.0]
    r_next = inject_rotation(r_plus, error_mean)
    # FAULT: the next innovation is never applied.
    _vector(innovation, 3, "innovation")
    return r_next
