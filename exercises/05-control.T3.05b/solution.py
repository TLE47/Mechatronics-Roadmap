"""Exercise 05-control.T3.05b - reference solution.

The tangent-space half of an Error-State Kalman Filter: Rodrigues' exponential on SO(3), the
multiplicative injection that folds a posterior attitude error into the nominal rotation, and the
reset that consumes the error-state mean so the same correction is never applied twice.
"""

import math


def _vector(value, length, name):
    """A plain list of floats of exactly `length` entries, or a ValueError naming the argument."""
    if not isinstance(value, (list, tuple)) or len(value) != length:
        raise ValueError("%s must be a %d-vector" % (name, length))
    return [float(item) for item in value]


def _matrix(value):
    """A 3x3 matrix as a list of three lists of three floats."""
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError("a rotation is a 3x3 matrix")
    rows = []
    for row in value:
        if not isinstance(row, (list, tuple)) or len(row) != 3:
            raise ValueError("a rotation is a 3x3 matrix")
        rows.append([float(item) for item in row])
    return rows


def exp_so3(rotvec):
    """Rodrigues: exp([rotvec]_x), the rotation its axis-angle vector names."""
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
        # sin(theta)/theta -> 1 and (1 - cos theta)/theta^2 -> 1/2; the half-angle form keeps
        # the second coefficient exact instead of subtracting two numbers that are both 1.
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
    """R^+ = R^- exp([d_theta]_x): fold the posterior tangent-space error into the rotation."""
    r = _matrix(r_nominal)
    step = exp_so3(d_theta)
    return [
        [sum(r[i][m] * step[m][j] for m in range(3)) for j in range(3)]
        for i in range(3)
    ]


def eskf_rotation_update(r_nominal, d_theta, innovation):
    """One rotation step of the filter: inject, reset, then apply the next innovation.

    The reset is the whole point. `d_theta` is the *posterior* error that the injection has just
    consumed, so the error-state mean must go back to zero; a filter that leaves it set applies
    the same correction again on the next update, even one whose innovation is zero.
    """
    r_plus = inject_rotation(r_nominal, d_theta)
    # The injection consumed the posterior mean: reset the tangent error to zero first.
    error_mean = [0.0, 0.0, 0.0]
    r_next = inject_rotation(r_plus, error_mean)
    return inject_rotation(r_next, innovation)
