"""Planted fault: a "tiny angle, just return the identity" shortcut.

The Taylor branch exists to keep the coefficients accurate, not to discard the rotation: at a
nanoradian the true matrix is `I + [phi]_x` and the identity is wrong in the first order, which is
exactly what integrating a gyro at 1 kHz would lose on every tick.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def hat(w):
    wx, wy, wz = w[0], w[1], w[2]
    return [[0.0, -wz, wy],
            [wz, 0.0, -wx],
            [-wy, wx, 0.0]]


def vee(m):
    return [m[2][1], m[0][2], m[1][0]]


def mat3_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def mat3_vec(a, v):
    return [sum(a[i][j] * v[j] for j in range(3)) for i in range(3)]


def exp_so3(phi):
    theta = math.sqrt(sum(value * value for value in phi))
    if theta < 1e-7:
        return [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    k = hat(phi)
    k2 = mat3_mul(k, k)
    c1 = math.sin(theta) / theta
    c2 = (1.0 - math.cos(theta)) / (theta * theta)
    return [[(1.0 if i == j else 0.0) + c1 * k[i][j] + c2 * k2[i][j] for j in range(3)]
            for i in range(3)]


def energy_rate(h_grad, x_dot, dissipation=0.0):
    return sum(g * v for g, v in zip(h_grad, x_dot)) - dissipation
