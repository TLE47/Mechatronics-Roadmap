"""Planted fault: Tustin applied entry by entry, as if A were four scalars.

The bilinear map is a matrix similarity: `(I - Ts A / 2)^-1 (I + Ts A / 2)`. Applying it to each
entry independently drops the coupling the off-diagonal carries, and the discretised system no
longer has A's poles.
"""

import cmath
import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def companion_state_matrices(j, k, b):
    return ([[0.0, 1.0], [-k / j, -b / j]], [[0.0], [1.0 / j]])


def eigvals_2x2(a):
    tr = a[0][0] + a[1][1]
    det = a[0][0] * a[1][1] - a[0][1] * a[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return (0.5 * (tr + disc), 0.5 * (tr - disc))


def is_stable(a):
    return all(value.real < 0.0 for value in eigvals_2x2(a))


def discretize_euler(a, b, ts):
    ad = [[(1.0 if i == j else 0.0) + ts * a[i][j] for j in range(2)] for i in range(2)]
    bd = [[ts * b[i][0]] for i in range(2)]
    return ad, bd


def discretize_tustin(a, b, ts):
    ad = [[(1.0 + 0.5 * ts * a[i][j]) / (1.0 - 0.5 * ts * a[i][j]) for j in range(2)]
          for i in range(2)]
    bd = [[ts * b[i][0] / (1.0 - 0.5 * ts * a[i][i])] for i in range(2)]
    return ad, bd


def simulate_discrete(ad, bd, x0, u, steps):
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x
