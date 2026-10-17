"""Exercise 00-foundations.T3.00a - reference solution.

The hat map is the whole subject in miniature: it turns a cross product into a matrix, its cube is
minus itself for a unit axis, and that identity is what collapses the exponential series into
Rodrigues' closed form. The small-angle branch matters: without it the `(1 - cos theta)/theta^2`
coefficient is 0/0 at a nanoradian and the "rotation" stops being orthogonal.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def hat(w):
    """The 3x3 skew matrix with `[w]_x v == w x v`."""
    wx, wy, wz = w[0], w[1], w[2]
    return [[0.0, -wz, wy],
            [wz, 0.0, -wx],
            [-wy, wx, 0.0]]


def vee(m):
    """Inverse of `hat`, refusing a matrix that is not skew-symmetric."""
    if abs(m[0][1] + m[1][0]) > 1e-12 or abs(m[0][2] + m[2][0]) > 1e-12 or abs(m[1][2] + m[2][1]) > 1e-12:
        raise ValueError("vee needs a skew-symmetric matrix")
    if abs(m[0][0]) > 1e-12 or abs(m[1][1]) > 1e-12 or abs(m[2][2]) > 1e-12:
        raise ValueError("vee needs a skew-symmetric matrix")
    return [m[2][1], m[0][2], m[1][0]]


def mat3_mul(a, b):
    """Row-by-column product of two 3x3 matrices."""
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def mat3_vec(a, v):
    """Matrix times vector."""
    return [sum(a[i][j] * v[j] for j in range(3)) for i in range(3)]


def exp_so3(phi):
    """`exp([phi]_x)` by Rodrigues' formula, with the small-angle branch.

    For a rotation vector `phi` of length `theta`, the series collapses to
    `I + (sin theta / theta) K + ((1 - cos theta) / theta^2) K^2`. At `theta -> 0` the two
    coefficients are `1 - theta^2 / 6` and `1/2 - theta^2 / 24`; computing the second one directly
    is catastrophic cancellation, and the matrix stops being orthogonal.
    """
    theta = math.sqrt(sum(value * value for value in phi))
    k = hat(phi)
    k2 = mat3_mul(k, k)
    if theta < 1e-7:
        c1 = 1.0 - theta * theta / 6.0
        c2 = 0.5 - theta * theta / 24.0
    else:
        c1 = math.sin(theta) / theta
        c2 = (1.0 - math.cos(theta)) / (theta * theta)
    return [[(1.0 if i == j else 0.0) + c1 * k[i][j] + c2 * k2[i][j] for j in range(3)]
            for i in range(3)]


def energy_rate(h_grad, x_dot, dissipation=0.0):
    """Power balance `dH/dt = grad(H) . x_dot - dissipation` for a Hamiltonian system."""
    return sum(g * v for g, v in zip(h_grad, x_dot)) - dissipation


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
