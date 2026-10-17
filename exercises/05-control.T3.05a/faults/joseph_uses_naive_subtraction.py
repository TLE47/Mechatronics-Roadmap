"""Planted fault: the covariance update is the textbook subtraction (1 - K H) P^-.

At the optimal gain this still returns 0.80, which is why the worked example cannot catch it; at
K = 1.5 it returns -2.0 instead of 11.25.

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


def optimal_gain(p_minus, h, r):
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if h <= 0.0:
        raise ValueError("a zero measurement Jacobian carries no information")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return p_minus * h / (h * p_minus * h + r)


def joseph_variance(p_minus, h, r, k):
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return (1.0 - k * h) * p_minus


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if u_min >= u_max:
        raise ValueError("the actuator bounds must leave an interval, not %r >= %r"
                         % (u_min, u_max))
    upper = min(u_max, alpha * h_value)
    if upper < u_min:
        raise ValueError("infeasible: the barrier allows at most %r, below u_min %r"
                         % (upper, u_min))
    return min(max(u_nom, u_min), upper)


def barrier_lower_bound(h0, alpha, t):
    if h0 < 0.0:
        raise ValueError("the initial margin is a distance, so it cannot be negative")
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if t < 0.0:
        raise ValueError("time only runs forwards in this filter")
    return h0 * math.exp(-alpha * t)


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


def nees_diagonal(error, variances):
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))
