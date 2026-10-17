"""Exercise 00-foundations.T2.00e - reference solution.

The eigenvalues of A are the poles of the transfer function, so stability is a property of the
matrix, not of the simulation. Discretisation changes the matrix but not the physics: Tustin keeps a
stable pole inside the unit circle at every step size, while forward Euler leaves it when Ts grows.
"""

import cmath
import math

import mechalab_plant as plant


def companion_state_matrices(j, k, b):
    """Companion form for the rotational drive."""
    return ([[0.0, 1.0], [-k / j, -b / j]],
            [[0.0], [1.0 / j]])


def eigvals_2x2(a):
    """Eigenvalues from trace and determinant."""
    tr = a[0][0] + a[1][1]
    det = a[0][0] * a[1][1] - a[0][1] * a[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return (0.5 * (tr + disc), 0.5 * (tr - disc))


def is_stable(a):
    """Both real parts strictly negative."""
    return all(value.real < 0.0 for value in eigvals_2x2(a))


def _matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(len(b))) for j in range(len(b[0]))]
            for i in range(len(a))]


def discretize_euler(a, b, ts):
    """Forward Euler."""
    ad = [[(1.0 if i == j else 0.0) + ts * a[i][j] for j in range(2)] for i in range(2)]
    bd = [[ts * b[i][0]] for i in range(2)]
    return ad, bd


def _inverse_2x2(m):
    det = m[0][0] * m[1][1] - m[0][1] * m[1][0]
    if abs(det) < 1e-15:
        raise ValueError("matrix is singular")
    return [[m[1][1] / det, -m[0][1] / det], [-m[1][0] / det, m[0][0] / det]]


def discretize_tustin(a, b, ts):
    """Bilinear transform."""
    minus = [[(1.0 if i == j else 0.0) - 0.5 * ts * a[i][j] for j in range(2)] for i in range(2)]
    plus = [[(1.0 if i == j else 0.0) + 0.5 * ts * a[i][j] for j in range(2)] for i in range(2)]
    inverse = _inverse_2x2(minus)
    return _matmul(inverse, plus), [[ts * sum(inverse[i][k] * b[k][0] for k in range(2))]
                                    for i in range(2)]


def simulate_discrete(ad, bd, x0, u, steps):
    """Constant-input discrete loop."""
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
