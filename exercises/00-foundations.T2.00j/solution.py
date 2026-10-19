"""Reference solution for 00-foundations.T2.00j - covariance and the predict step."""


def _check_2x2(name, matrix):
    if len(matrix) != 2 or any(len(row) != 2 for row in matrix):
        raise ValueError("%s: expected a 2x2 matrix, got %r" % (name, matrix))


def covariance_propagate(a, sigma, q):
    """Sigma' = A Sigma A^T + Q."""
    _check_2x2("covariance_propagate(a)", a)
    _check_2x2("covariance_propagate(sigma)", sigma)
    _check_2x2("covariance_propagate(q)", q)
    asigma = [[sum(a[i][k] * sigma[k][j] for k in range(2)) for j in range(2)]
              for i in range(2)]
    out = [[0.0, 0.0], [0.0, 0.0]]
    for i in range(2):
        for j in range(2):
            out[i][j] = sum(asigma[i][k] * a[j][k] for k in range(2)) + q[i][j]
    return out


def symmetrize(sigma):
    """(sigma + sigma^T) / 2."""
    rows = len(sigma)
    if any(len(row) != rows for row in sigma):
        raise ValueError("symmetrize: expected a square matrix, got %r" % (sigma,))
    return [[0.5 * (sigma[i][j] + sigma[j][i]) for j in range(rows)] for i in range(rows)]
