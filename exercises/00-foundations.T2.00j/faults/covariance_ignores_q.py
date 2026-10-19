"""Planted fault: the process noise Q is never added.

The sandwich rule is right, so the coupling and the symmetry both hold; only the new uncertainty
from the step itself is missing, which is the term that stops a filter growing overconfident.
"""

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def _check_2x2(name, matrix):
    if len(matrix) != 2 or any(len(row) != 2 for row in matrix):
        raise ValueError("%s: expected a 2x2 matrix, got %r" % (name, matrix))


def covariance_propagate(a, sigma, q):
    _check_2x2("covariance_propagate(a)", a)
    _check_2x2("covariance_propagate(sigma)", sigma)
    _check_2x2("covariance_propagate(q)", q)
    asigma = [[sum(a[i][k] * sigma[k][j] for k in range(2)) for j in range(2)]
              for i in range(2)]
    return [[sum(asigma[i][k] * a[j][k] for k in range(2)) for j in range(2)]
            for i in range(2)]


def symmetrize(sigma):
    rows = len(sigma)
    if any(len(row) != rows for row in sigma):
        raise ValueError("symmetrize: expected a square matrix, got %r" % (sigma,))
    return [[0.5 * (sigma[i][j] + sigma[j][i]) for j in range(rows)] for i in range(rows)]
