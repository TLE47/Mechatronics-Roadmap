"""Planted fault: Rodrigues' expansion keeps the skew term and drops the K^2 term.

`I + (sin t / t) K` is not a rotation: it leaves 1.0 on the diagonal where the worked 0.10 rad
step about +x needs cos(0.10) = 0.995004..., so the matrix stops being orthogonal for any large
angle while still looking plausible at 0.05 rad.

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
    first = 1.0 if theta < 1e-8 else math.sin(theta) / theta
    # FAULT: the (1 - cos t) / t^2 * K^2 term is missing.
    return [
        [(1.0 if i == j else 0.0) + first * skew[i][j] for j in range(3)]
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
    return inject_rotation(r_next, innovation)
